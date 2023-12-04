import puppeteer from "puppeteer"
import fs from "fs"
import path from 'path';
import { fileURLToPath } from 'url';
import checkDiskSpace from 'check-disk-space'

const DOMAIN = "https://gamifa.vn"
let queueUrls = [{ url: DOMAIN, count: 1 }]
let alreadyGetSitemap = []
let listSiteMapSucess = []
const MIN_DISK_SPACE_TO_RUN = 1 // 1GB

const MAX_DEEP_LENGTH = 6

const checkName = (alreadyPush, urlName) => {
  let name = urlName.includes("?") ? urlName.split("?")[0] : urlName
  if (alreadyPush.includes(name)) {
    const array = name.split("-")
    const last = array[array.length - 1]
    if (isNaN(Number(last))) {
      name = name + "-1"
    }
    return checkName(alreadyPush, name)
  }
  name = name.endsWith("#") ? name.slice(0, name.length - 1) : name
  return name.endsWith(".html") ? name : name + ".html"
}

const removeChar = (str) => {
  let strReturn = str.split("#")?.[0] || ""
  // strReturn = strReturn.endsWith("/") ? strReturn.slice(0, strReturn.length - 1) : strReturn
  // strReturn = strReturn.split("#")?.[0] || ""
  return strReturn
}

const writeFileStream = (filename, data) => {
  const writeStream = fs.createWriteStream(filename, { flags: 'a' });
  writeStream.write(data)
}

async function generateSitemap({ url, count }) {
  if (!url || alreadyGetSitemap.includes(url) || count >= MAX_DEEP_LENGTH) {
    queueUrls = queueUrls.filter(i => i.url !== url)
    return
  }
  alreadyGetSitemap.push(url)
  const _count = count + 1
  const browser = await puppeteer.launch({
    headless: "new"
  });
  const page = await browser.newPage();

  // Navigate to the URL
  await page.goto(url);

  // Extract URLs from the page (you may need to adjust this based on the structure of the website)
  const _urls = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a');
    return Array.from(anchors).map(anchor => anchor.href);
  });

  const formSubmitHrefs = await page.evaluate(() => {
    const forms = document.querySelectorAll('form'); // Select all forms on the page

    // Extract href attributes from submit buttons within forms
    const hrefs = Array.from(forms).reduce((accumulator, form) => {
      const submitButtons = form.querySelectorAll('[type="submit"]');

      const formHrefs = Array.from(submitButtons).map(submitButton => {
        const parentForm = submitButton.closest('form');
        return parentForm.getAttribute('action');
      });

      return accumulator.concat(formHrefs);
    }, []);

    return hrefs;
  });

  const urls = [..._urls, ...formSubmitHrefs].filter(i => !!i).reduce((URLlisting, current_url) => {
    if (!current_url.startsWith("https://") || !current_url.startsWith(DOMAIN)) {
      return URLlisting
    }
    return URLlisting.findIndex(i => i === current_url) === -1 ? [...URLlisting, current_url] : URLlisting
  }, [])

  const newURLs = [...queueUrls, ...urls.map(url => ({ url, count: _count }))].reduce((list, current) => {
    return list.findIndex(i => i.url === removeChar(current.url)) !== -1 || alreadyGetSitemap.includes(removeChar(current.url)) || removeChar(current.url) === url ? list : [...list, {
      url: removeChar(current.url),
      count: current.count
    }]
  }, [])
  queueUrls = newURLs

  // Close the browser
  await browser.close();
}

function getResponseDocument(url) {
  return new Promise(async (resolve) => {
    const browser = await puppeteer.launch({
      headless: "new"
    });
    const page = await browser.newPage();

    // Enable request interception before navigation
    await page.setRequestInterception(true);

    // Listen for the response event
    page.on('response', async (response) => {
      const responseUrl = response.url();
      let alreadyPush = []

      console.log("response.status()", response.status());
      if (response.status() !== 200) {
        page.removeAllListeners()

        await page.setRequestInterception(false);

        // Close the browser
        await browser.close();
        resolve()
        return
      }

      listSiteMapSucess.push(url)

      // Check if the response contains HTML content
      if (response.headers()['content-type']?.includes?.('text/html')) {
        const responseBody = await response.text();
        console.log('Response URL:', responseUrl, responseBody.slice(0, 100));
        // url without https
        //remove / end
        const _url = url.endsWith("/") ? url.slice(0, url.length - 1) : url
        const array = _url.split("/")

        let urlName = array[array.length - 1]
        if (urlName) {
          urlName = checkName(alreadyPush, urlName)
          alreadyPush.push(urlName)
          writeFileStream(`public/${urlName}`, responseBody)
        }
        page.removeAllListeners()

        await page.setRequestInterception(false);

        // Close the browser
        await browser.close();
        resolve()
      } else {
        resolve()
      }
    });

    // Listen for the request event to filter unnecessary requests
    page.on('request', (request) => {
      // Block unnecessary requests, e.g., images, stylesheets, scripts
      if (['image', 'stylesheet', 'script'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Navigate to the specified URL
    await page.goto(url);
  })
}

// Call the function to generate sitemap for a specific website

async function caivongtronnay() {
  console.log("queueUrls.length", queueUrls.length)
  if (queueUrls.length > 0) {
    console.log("url", queueUrls[0])
    await generateSitemap(queueUrls[0]);
    setTimeout(caivongtronnay, 0);
  } else {
    for (let index = 0; index < alreadyGetSitemap.length; index++) {
      const url = alreadyGetSitemap[index];
      try {
        await getResponseDocument(url);
      } catch (error) {
        console.log("error", error);
      }
    }

    // Generate sitemap XML
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${listSiteMapSucess.map(url => `<url><loc>${url}</loc></url>`).join('\n')}
    </urlset>`;

    // Save sitemap to a file
    writeFileStream('sitemap.xml', sitemapXml)
  }
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const pathPublicFolder = path.join(__dirname, "/public")
  fs.chmod(__dirname, '755', function (err) {
    if (err) {
      console.log("Perrmission denied for write in folder " + __dirname)
      return
    }
    fs.chmod(pathPublicFolder, '755', function (err) {
      if (err) {
        console.log("Perrmission denied for write in folder " + pathPublicFolder)
        return
      }
      checkDiskSpace(__dirname).then((diskSpace) => {
        if (Number(diskSpace.free) / 1024 / 1024 / 1024 <= MIN_DISK_SPACE_TO_RUN) {
          console.log(`Not have enough space Min: ${MIN_DISK_SPACE_TO_RUN}GB`)
        } else {
          caivongtronnay()
        }
      })
    });
  });
}

main()