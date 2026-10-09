const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ window: {}, console, URL, URLSearchParams });
vm.runInContext(fs.readFileSync('lib/wikimedialib.js', 'utf8'), context);
const WikimediaLib = context.window.WikimediaLib;

(async () => {
    const media = new WikimediaLib();
    assert.equal(media.useBlobUrl, false);
    let fetches = 0, release;
    media.fetchJsonWithCacheInternal = async () => {
        fetches++;
        return new Promise(resolve => { release = resolve; });
    };
    const first = media.fetchJsonWithCache('https://example.org/info');
    const second = media.fetchJsonWithCache('https://example.org/info');
    assert.equal(fetches, 1);
    release({ shared: true });
    assert.deepEqual(await first, await second);
    assert.equal(media.pendingInfoRequests.size, 0);
    media.fetchJsonWithCacheInternal = async () => { throw new Error('offline'); };
    await assert.rejects(media.fetchJsonWithCache('failed'), /offline/);
    assert.equal(media.pendingInfoRequests.size, 0);

    const info = { url: 'https://example.org/original.jpg', thumburl: 'https://example.org/thumb.jpg' };
    media.fetchJsonWithCache = async () => ({ query: { pages: { 1: { imageinfo: [info] } } } });
    media.revokeImageBlobUrl = () => {};
    media.renderCopyright = () => {};
    media.cacheImageFile = async () => { throw new Error('Must not block native image loading'); };
    media.getCachedImageSrc = async () => { throw new Error('Must not wait for blobs by default'); };
    const image = { dataset: {}, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; } };
    await media.getWikiMediaImage('File:Example.jpg', 320, image);
    assert.equal(image.src, info.thumburl);
    assert.equal(image.attributes.src_org, info.url);
    assert.equal(image.attributes.src_thumb, info.thumburl);

    const blobMedia = new WikimediaLib({ useBlobUrl: true });
    blobMedia.fetchJsonWithCache = media.fetchJsonWithCache;
    blobMedia.revokeImageBlobUrl = () => {};
    blobMedia.renderCopyright = () => {};
    blobMedia.getCachedImageSrc = async () => 'blob:cached-image';
    await blobMedia.getWikiMediaImage('File:Example.jpg', 320, image);
    assert.equal(image.src, 'blob:cached-image');
    console.log('PASS: native image loading avoids blob/cache delays, concurrent API requests are shared, failures clear requests, explicit blob mode remains supported');
})().catch(error => { console.error(error); process.exitCode = 1; });
