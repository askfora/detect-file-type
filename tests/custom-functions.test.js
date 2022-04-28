import {assert} from 'chai';
import detect from '../src/index';

import htmlTags from 'html-tags';

const basic = /\s?<!doctype html>|(<html\b[^>]*>|<body\b[^>]*>|<x-[^>]+>)+/i;
const full = new RegExp(htmlTags.map(tag => `<${tag}\\b[^>]*>`).join('|'), 'i');

function isHtml(string) {
    // We limit it to a reasonable length to improve performance.
    string = string.trim().slice(0, 1000);

    return basic.test(string) || full.test(string);
}

describe('custom function', () => {
  it(`should detect html without fixture`, async () => {
    detect.addCustomFunction((buffer) => {
      const str = buffer.toString();
      if (isHtml(str)) {
        return {
          ext: 'html',
          mime: 'text/html'
        }
      }

      return false;
    });

    detect.fromFile('./files/fixture-strong-html.html', (err, result) => {
      assert.equal(err, null);
      assert.deepEqual(result, {
        ext: 'html',
        mime: 'text/html'
      });
    });
  });
});
