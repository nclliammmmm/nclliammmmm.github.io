/**
 * scrape-sumup.js
 *
 * Simple Node script to scrape product links, titles, images and prices from:
 *   https://cloudworks.sumupstore.com/products
 *
 * Usage:
 *   1. npm init -y
 *   2. npm install node-fetch@2 cheerio
 *   3. node scrape-sumup.js
 *
 * Output: products.json in the same folder.
 *
 * Notes:
 * - This is a best-effort scraper. SumUp markup may change; you might need to adjust selectors.
 * - Run locally (or in CI) and commit products.json to your repo for the site to render product cards.
 * - Respect the store's terms of use and robots.txt.
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const BASE = 'https://cloudworks.sumupstore.com';
const PRODUCTS_PAGE = `${BASE}/products`;

async function fetchHtml(url){
  const res = await fetch(url, { headers: { 'User-Agent': 'product-scraper/1.0 (+https://github.com/yourname)' } });
  if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

async function main(){
  try{
    console.log('Fetching products page...');
    const html = await fetchHtml(PRODUCTS_PAGE);
    const $ = cheerio.load(html);

    // Collect unique product links that contain /products/
    const anchors = new Set();
    $('a[href*="/products/"]').each((i, el)=>{
      const href = $(el).attr('href');
      if(href && !href.includes('/cart') && !href.endsWith('/products')) {
        const absolute = href.startsWith('http') ? href : (href.startsWith('/') ? BASE + href : BASE + '/' + href);
        anchors.add(absolute.split('#')[0].split('?')[0]);
      }
    });

    const productUrls = Array.from(anchors).filter(u => u.includes('/products/'));
    console.log(`Found ${productUrls.length} product urls (will try to scrape each).`);

    const products = [];
    for(const url of productUrls){
      try{
        console.log('Scraping', url);
        const pHtml = await fetchHtml(url);
        const $$ = cheerio.load(pHtml);

        // Try common selectors; SumUp pages often include meta tags we can use.
        const name = $$('meta[property="og:title"]').attr('content') || $$('h1').first().text().trim() || $$('title').text().trim();
        const image = $$('meta[property="og:image"]').attr('content') || $$('img').first().attr('src') || '';
        // Try to find a price via meta or visible node
        let price = $$('meta[itemprop="price"]').attr('content') || $$('meta[property="product:price:amount"]').attr('content') || '';
        if(!price){
          // visible price selectors (best-effort)
          const priceText = $$('[class*="price"], [class*="product-price"], [class*="Price"]').first().text().trim();
          price = priceText || '';
        }

        // Description snippet (optional)
        const description = $$('meta[name="description"]').attr('content') || $$('p').first().text().trim() || '';

        products.push({
          name: name || 'Product',
          url,
          image: image ? (image.startsWith('http') ? image : BASE + image) : '',
          price: price || '',
          description: description || ''
        });

        // polite delay
        await new Promise(r => setTimeout(r, 600));
      }catch(err){
        console.warn('Failed to scrape product', url, err.message);
      }
    }

    const outPath = path.join(__dirname, 'products.json');
    fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');
    console.log(`Wrote ${products.length} products to ${outPath}`);
  }catch(err){
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
