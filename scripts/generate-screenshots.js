import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Config
const PORT = 3000;
const URL = `http://localhost:${PORT}`;
const OUTPUT_DIR = path.join(process.cwd(), 'docs', 'screenshots');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  console.log('Starting dev server...');
  return new Promise((resolve, reject) => {
    const serverProcess = spawn('npm', ['run', 'dev'], { 
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, DEMO_MODE: '1' } 
    });

    let started = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (!started && (output.includes('Ready in') || output.includes('ready started server on'))) {
        started = true;
        console.log('Server started successfully.');
        resolve(serverProcess);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      // Just log, don't necessarily reject as Next.js writes warnings to stderr
      // console.error(`Server stderr: ${data}`);
    });

    serverProcess.on('error', (err) => {
      if (!started) reject(err);
    });

    serverProcess.on('close', (code) => {
      if (!started) reject(new Error(`Server exited early with code ${code}`));
    });
    
    // Fallback timeout in case we miss the ready message
    setTimeout(() => {
      if (!started) {
        console.log('Timeout waiting for ready message, assuming server is up...');
        started = true;
        resolve(serverProcess);
      }
    }, 15000);
  });
}

async function captureScreenshots() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({ 
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  const page = await browser.newPage();
  
  // Set Desktop viewport
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  
  console.log('Capturing: 1. Login screen');
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await wait(1000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '01-login-screen.png') });

  console.log('Capturing: 2. Language selector showing all languages');
  await page.waitForSelector('select[aria-label="Select Language"]', { timeout: 10000 });
  await page.click('select[aria-label="Select Language"]'); 
  await wait(1000); // wait for dropdown animation
  await page.screenshot({ path: path.join(OUTPUT_DIR, '02-language-selector.png') });
  await page.keyboard.press('Escape'); // Click away to close
  await wait(500);

  console.log('Capturing: 3. Command Center (full dashboard)');
  // Click Supervisor login
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const supBtn = btns.find(b => b.textContent.includes('Supervisor'));
    if (supBtn) supBtn.click();
  });
  // Wait for React to render and navigation to complete client-side
  await wait(5000); // Wait for map and stats to load
  await page.screenshot({ path: path.join(OUTPUT_DIR, '03-command-center.png') });

  console.log('Capturing: 4. Map with markers (zoomed in)');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "MAP_PAN" } }));
  });
  await wait(2000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '04-map-zoomed.png') });

  console.log('Capturing: 5. Priority Queue with SLA countdowns');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "SCROLL_QUEUE" } }));
  });
  await wait(1500);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '05-priority-queue.png') });

  console.log('Capturing: 6. Entity detail with WhyPanel');
  await page.evaluate(() => {
    // Select an entity
    const clusters = document.querySelectorAll('.priority-queue-list button');
    if (clusters.length > 0) clusters[0].click();
    else {
      // simulate selection
      window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "SELECT_ENTITY", id: "cluster-1" } }));
    }
  });
  await wait(2000); // wait for WhyPanel to slide in
  await page.screenshot({ path: path.join(OUTPUT_DIR, '06-entity-detail.png') });

  console.log('Capturing: 7. ADAPT panel with "Loop Closed"');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "RECORD_OUTCOME", id: "cluster-1" } }));
  });
  await wait(3000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, '07-adapt-panel.png') });
  
  // Reset for next steps
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "ZOOM_OUT" } }));
  });
  await wait(1000);

  console.log('Capturing: 8. AI Bot open with tree health result');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("demo-action", { detail: { type: "OPEN_BOT" } }));
  });
  await wait(4000); // wait for bot response
  await page.screenshot({ path: path.join(OUTPUT_DIR, '08-ai-bot.png') });

  // Close bot for next view
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await wait(1000);

  // Field Worker Mobile view
  console.log('Capturing: 9. Field Worker view (mobile viewport)');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await wait(1000);
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const fwBtn = btns.find(b => b.textContent.includes('Field Worker'));
    if (fwBtn) fwBtn.click();
  });
  // Wait for React to render
  await wait(5000); // wait for task cards to load
  
  await page.screenshot({ path: path.join(OUTPUT_DIR, '09-field-worker-mobile.png') });

  await browser.close();
}

async function run() {
  let serverProcess;
  try {
    serverProcess = await startServer();
    await captureScreenshots();
    console.log('All screenshots captured successfully! Saved to docs/screenshots/');
  } catch (error) {
    console.error('Error running screenshot script:', error);
  } finally {
    if (serverProcess) {
      console.log('Killing dev server...');
      // On Windows, child_process.kill doesn't always kill subprocesses (like next js). 
      // Need a more forceful kill.
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
    }
    process.exit(0);
  }
}

run();
