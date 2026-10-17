import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readCookie } from '../src/utils/cookies.js';

describe('readCookie', () => {
  test('reads one cookie among several', () => {
    assert.equal(readCookie('a=1; access_token=abc.def; b=2', 'access_token'), 'abc.def');
  });

  test('returns undefined when the cookie or the header is missing', () => {
    assert.equal(readCookie('a=1', 'access_token'), undefined);
    assert.equal(readCookie(undefined, 'access_token'), undefined);
    assert.equal(readCookie('', 'access_token'), undefined);
  });

  test('does not match names that merely contain the requested name', () => {
    assert.equal(readCookie('x_access_token=bad; access_token_2=bad', 'access_token'), undefined);
  });

  test('decodes encoded values, unquotes quoted values, and the first duplicate wins', () => {
    assert.equal(readCookie('t=a%20b', 't'), 'a b');
    assert.equal(readCookie('t="quoted"', 't'), 'quoted');
    assert.equal(readCookie('t=first; t=second', 't'), 'first');
  });

  test('a malformed escape sequence falls back to the raw value', () => {
    assert.equal(readCookie('t=%E0%A4%A', 't'), '%E0%A4%A');
  });
});