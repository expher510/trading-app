import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR LOG:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });

  page.on('requestfailed', request => {
    console.log(`REQUEST FAILED: ${request.url()} - ${request.failure()?.errorText}`);
  });

  console.log("Navigating to http://186.240.145.87:3001/ ...");
  await page.goto('http://186.240.145.87:3001/', { waitUntil: 'networkidle0' });

  const html = await page.content();
  console.log("HTML length:", html.length);
  
  await browser.close();
})();
