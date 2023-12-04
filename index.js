import puppeteer from "puppeteer"

async function getAllSitemaps(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Điều hướng đến trang web cần lấy sitemap
  await page.goto(url);

  // Lấy tất cả các liên kết sitemap từ trang web
  const sitemapLinks = await page.$$eval('link[rel="sitemap"]', (elements) => elements.map(element => element.getAttribute('href')));

  // In ra danh sách sitemap
  console.log('Sitemaps Found:', sitemapLinks);

  // Đóng trình duyệt
  await browser.close();
}

// Gọi hàm để lấy sitemap từ trang web cụ thể
getAllSitemaps('https://example.com');