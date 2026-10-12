/**
 * Playwright script to capture high-definition marketing and design screenshots
 * for the GitHub repository.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureScreenshots() {
  const assetsDir = path.join(__dirname, 'docs', 'assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  console.log('Launching Playwright Chromium browser...');
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 920 },
    deviceScaleFactor: 2, // 2x Retina resolution for razor-sharp marketing images
  });

  const page = await context.newPage();
  const url = 'http://localhost:8080';

  console.log(`Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // 1. Hero Architecture Visualizer View
  console.log('Capturing: 01-architecture-visualizer.png');
  await page.click('button[data-tab="architecture"]');
  // Click on MDS Node 01 to show active inspector details
  await page.click('.arch-node.mds-node');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(assetsDir, '01-architecture-visualizer.png'),
  });

  // 2. Interactive Protocol Flow Simulator View
  console.log('Capturing: 02-protocol-simulator.png');
  await page.click('button[data-tab="protocol"]');
  await page.waitForTimeout(300);
  // Advance to Step 2 (OPEN & Fused LAYOUTGET)
  await page.click('button.flow-step-btn[data-step="2"]');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(assetsDir, '02-protocol-simulator.png'),
  });

  // 3. Scale & Bottleneck Simulation Lab View
  console.log('Capturing: 03-scale-bottleneck-lab.png');
  await page.click('button[data-tab="workload"]');
  await page.waitForTimeout(300);
  // Set high scale: 3,500 clients, 16 MDS nodes, 24 DS nodes
  await page.$eval('#sliderClients', el => { el.value = 3500; el.dispatchEvent(new Event('input')); });
  await page.$eval('#sliderMds', el => { el.value = 16; el.dispatchEvent(new Event('input')); });
  await page.$eval('#sliderDs', el => { el.value = 24; el.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(assetsDir, '03-scale-bottleneck-lab.png'),
  });

  // 4. Lattice CLI & find-API Sandbox View
  console.log('Capturing: 04-terminal-sandbox.png');
  await page.click('button[data-tab="terminal"]');
  await page.waitForTimeout(300);
  // Execute demo commands
  const input = await page.$('#terminalInput');
  if (input) {
    await input.fill('mds-status');
    await input.press('Enter');
    await page.waitForTimeout(200);
    await input.fill('rondb-status');
    await input.press('Enter');
    await page.waitForTimeout(200);
    await input.fill('mds-find --size +1G');
    await input.press('Enter');
    await page.waitForTimeout(300);
  }
  await page.screenshot({
    path: path.join(assetsDir, '04-terminal-sandbox.png'),
  });

  // 5. Certification Exam Quiz View
  console.log('Capturing: 05-certification-quiz.png');
  await page.click('button[data-tab="quiz"]');
  await page.waitForTimeout(300);
  // Start quiz to show live active question
  await page.click('#quizIntroState button');
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(assetsDir, '05-certification-quiz.png'),
  });

  // Remove temporary test file if present
  const testFile = path.join(assetsDir, 'test.png');
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }

  await browser.close();
  console.log('All screenshots successfully captured in docs/assets/');
}

captureScreenshots().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
