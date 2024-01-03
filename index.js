const {
	bodies,
	addons,
	liveries,
	carColors,
	liveryColors1,
	liveryColors2,
	wheels,
} = require('./options.json');
const fs = require('node:fs');
const path = require('path');
const puppeteer = require('puppeteer');
const locateChrome = require('locate-chrome');

const minimal_args = [
	'--autoplay-policy=user-gesture-required',
	'--disable-background-networking',
	'--disable-background-timer-throttling',
	'--disable-backgrounding-occluded-windows',
	'--disable-breakpad',
	'--disable-client-side-phishing-detection',
	'--disable-component-update',
	'--disable-default-apps',
	'--disable-dev-shm-usage',
	'--disable-domain-reliability',
	'--disable-extensions',
	'--disable-features=AudioServiceOutOfProcess',
	'--disable-hang-monitor',
	'--disable-ipc-flooding-protection',
	'--disable-notifications',
	'--disable-offer-store-unmasked-wallet-cards',
	'--disable-popup-blocking',
	'--disable-print-preview',
	'--disable-prompt-on-repost',
	'--disable-renderer-backgrounding',
	'--disable-setuid-sandbox',
	'--disable-speech-api',
	'--disable-sync',
	'--hide-scrollbars',
	'--ignore-gpu-blacklist',
	'--metrics-recording-only',
	'--mute-audio',
	'--no-default-browser-check',
	'--no-first-run',
	'--no-pings',
	'--no-sandbox',
	'--no-zygote',
	'--password-store=basic',
	'--use-gl=swiftshader',
	'--use-mock-keychain',
];

const generateVariants = async () => {
	const variants = [];

	for (const body of bodies) {
		for (const addon of addons) {
			for (const livery of liveries) {
				for (const carColor of carColors) {
					for (const liveryColor1 of liveryColors1) {
						if (liveryColor1.value === carColor.value) {
							continue;
						}

						for (const liveryColor2 of liveryColors2) {
							if (
								liveryColor2.value === carColor.value ||
								liveryColor2.value === liveryColor1.value
							) {
								continue;
							}

							for (const wheel of wheels) {
								variants.push({
									body,
									addon,
									livery,
									carColor,
									liveryColor1,
									liveryColor2,
									wheels: wheel,
								});
							}
						}
					}
				}
			}
		}
	}

	await fs.promises.writeFile(
		path.join(process.cwd(), `variants.json`),
		JSON.stringify(variants, null, 2)
	);
};

const createBrowser = async () => {
	const executablePath =
		(await new Promise((resolve) => locateChrome((arg) => resolve(arg)))) ||
		'';

	const browser = await puppeteer.launch({
		headless: 'new',
		executablePath,
		args: minimal_args,
	});

	return browser;
};

const generateImages = async () => {
	const variants = require('./variants.json');

	const svg = await fs.promises.readFile(
		path.join(process.cwd(), 'cleaned.svg'),
		'utf8'
	);

	const browser = await createBrowser();

	const filtered = variants.filter(
		(v) => v.body.name === process.env.BODY_TYPE
	);
	const chunkSize = parseInt(process.env.CHUNK_SIZE);
	const chunked = chunks(filtered, chunkSize);
	const promises = [];

	console.log(
		`Generating ${filtered.length} variants in ${chunked.length} chunks`
	);
	for (let i = 0; i < chunked.length; i++) {
		promises.push(
			processBatch(chunked[i], svg, i * chunkSize, filtered.length)
		);
	}

	await Promise.all(promises);
	await browser.close();
};

const cleanSVG = async () => {
	const browser = await createBrowser();
	const page = await browser.newPage();

	page.on('console', async (msg) => {
		const msgArgs = msg.args();
		for (let i = 0; i < msgArgs.length; ++i) {
			console.log(await msgArgs[i].jsonValue());
		}
	});

	await prepareSvg(page);

	const data = await page.evaluate(
		() => document.querySelector('svg').outerHTML
	);
	await fs.promises.writeFile(path.join(process.cwd(), `cleaned.svg`), data);

	await page.close();
	await browser.close();
};

const chunks = (a, size) =>
	Array.from(new Array(Math.ceil(a.length / size)), (_, i) =>
		a.slice(i * size, i * size + size)
	);

const processBatch = async (browser, batch, svg, startIndex, total) => {
	const page = await browser.newPage();

	page.on('console', async (msg) => {
		const msgArgs = msg.args();
		for (let i = 0; i < msgArgs.length; ++i) {
			console.log(await msgArgs[i].jsonValue());
		}
	});

	for (let i = 0; i < batch.length; i++) {
		await generateVariantImage(batch[i], svg, page, startIndex + i, total);
	}

	await page.close();
};

const prepareSvg = async (page) => {
	const svg = await fs.promises.readFile(
		path.join(process.cwd(), 'input.svg'),
		'utf8'
	);

	await page.setContent(svg);

	await page.evaluate(
		([bodies, liveries]) => {
			for (const body of bodies) {
				const bodyDom = document.querySelector(`#${body.identifier}`);
				bodyDom.style.display = 'none';

				const carDom = bodyDom.querySelector(`g[id^="car" i]`);

				for (const carDomChild of [...carDom.children]) {
					carDomChild.style.fill = '#fff';
				}

				const addonDom = bodyDom.querySelector(`g[id^="add-ons" i]`);
				for (const addonChildDom of [...addonDom.children]) {
					if (addonChildDom.id?.length) {
						addonChildDom.style.display = 'none';
					}
				}

				const wheelsDom = bodyDom.querySelector(`g[id^="wheels" i]`);
				for (const wheelsChildDom of [...wheelsDom.children]) {
					if (
						wheelsChildDom.id?.length &&
						!wheelsChildDom.id?.toLowerCase().startsWith('shadow')
					) {
						wheelsChildDom.style.display = 'none';
					}
				}

				for (const livery of liveries) {
					const liveryDom = bodyDom.querySelector(
						`g[id^="${livery.identifier.toLowerCase()}" i]`
					);
					liveryDom.style.display = 'none';

					const color1StyleChildren = liveryDom.querySelectorAll(
						`g[id^="${livery.color1Identifier}" i] *[style]`
					);
					for (const color1StyleChildDom of [
						...color1StyleChildren,
					]) {
						color1StyleChildDom.style.fill = '#fff';
					}

					const color2StyleChildren = liveryDom.querySelectorAll(
						`g[id^="${livery.color2Identifier}" i] *[style]`
					);
					for (const color2StyleChildDom of [
						...color2StyleChildren,
					]) {
						color2StyleChildDom.style.fill = '#fff';
					}
				}
			}
		},
		[bodies, liveries]
	);
};

const generateVariantImage = async (variant, svg, page, index, total) => {
	const name = getVariantName(variant, index);

	const exists = fs.existsSync(
		path.join(process.cwd(), 'output', `${name}.png`)
	);
	if (exists) {
		console.log(`[${index + 1}/${total}] Skipped`);
		return;
	}

	await page.setContent(svg);
	await page.evaluate((variant) => {
		const bodyDom = document.querySelector(`#${variant.body.identifier}`);
		bodyDom.style.display = 'block';

		const carDom = bodyDom.querySelector(`g[id^="car" i]`);
		for (const carDomChild of [...carDom.children]) {
			carDomChild.style.fill = variant.carColor.value;
		}

		if (variant.addon.identifier) {
			const addonDom = bodyDom.querySelector(
				`g[id^="add-ons" i] g[id^="${variant.addon.identifier.toLowerCase()}" i]`
			);
			addonDom.style.display = 'block';
		}

		const liveryDom = bodyDom.querySelector(
			`g[id^="${variant.livery.identifier.toLowerCase()}" i]`
		);
		liveryDom.style.display = 'block';

		const color1StyleChildren = liveryDom.querySelectorAll(
			`g[id^="${variant.livery.color1Identifier}"] *[style]`
		);
		for (const color1StyleChildDom of [...color1StyleChildren]) {
			color1StyleChildDom.style.fill = variant.liveryColor1.value;
		}

		const color2StyleChildren = liveryDom.querySelectorAll(
			`g[id^="${variant.livery.color2Identifier}"] *[style]`
		);
		for (const color2StyleChildDom of [...color2StyleChildren]) {
			color2StyleChildDom.style.fill = variant.liveryColor2.value;
		}

		const wheelsDom = bodyDom.querySelector(
			`g[id^="wheels" i] g[id^="${variant.wheels.identifier.toLowerCase()}" i]`
		);
		wheelsDom.style.display = 'block';
	}, variant);

	const content = await page.$('body');
	await content.screenshot({
		path: `output/${name}.png`,
		omitBackground: true,
	});
	console.log(`[${index + 1}/${total}] Saved "${name}.png" to output folder`);
};

const getVariantName = (variant, index) => {
	return `${index + 1}_${variant.body.name}_A-${variant.addon.name}_L-${
		variant.livery.name
	}_CC-${variant.carColor.name}_LC1-${variant.liveryColor1.name}_LC2-${
		variant.liveryColor2.name
	}_W-${variant.wheels.name}`;
};

(async () => {
	let fn;
	switch (process.env.TASK) {
		case 'GENERATE_VARIANTS':
			fn = generateVariants;
			break;
		case 'GENERATE_IMAGES':
			fn = generateImages;
			break;
		case 'CLEAN_SVG':
			fn = cleanSVG;
			break;
	}

	console.log(`Running task: ${process.env.TASK}`);
	await fn();
	console.log(`Finished task: ${process.env.TASK}`);
})();
