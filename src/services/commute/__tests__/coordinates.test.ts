import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findEmbeddedCoordinates, parseWholeCoordinateInput } from '../coordinates';
import { InvalidCoordinatesError } from '../errors';
import { extractCoordinates, extractCoordinatesFromBody, extractPlaceQuery, findUrlInText, isShortMapLink } from '../mapLinks';
import { FULL_LINK, MAP_CENTER, SCHOOL_PLACE, SHORT_LINK } from './helpers';

describe('coordinate pairs', () => {
  it('parses comma, space and parenthesised pairs', () => {
    assert.deepEqual(parseWholeCoordinateInput('47.9206526, 106.9662756'), SCHOOL_PLACE);
    assert.deepEqual(parseWholeCoordinateInput('47.9206526,106.9662756'), SCHOOL_PLACE);
    assert.deepEqual(parseWholeCoordinateInput('(47.9206526 106.9662756)'), SCHOOL_PLACE);
    assert.deepEqual(parseWholeCoordinateInput('-33.8688, 151.2093'), { latitude: -33.8688, longitude: 151.2093 });
  });

  it('returns null for addresses and house-number text (so they are geocoded, not misparsed)', () => {
    assert.equal(parseWholeCoordinateInput('Peace Avenue 12, 34'), null);
    assert.equal(parseWholeCoordinateInput('12, 34'), null);
    assert.equal(parseWholeCoordinateInput('Sukhbaatar Square, Ulaanbaatar'), null);
  });

  it('throws on pair-shaped but invalid values instead of guessing', () => {
    assert.throws(() => parseWholeCoordinateInput('106.9662756, 47.9206526'), InvalidCoordinatesError); // swapped
    assert.throws(() => parseWholeCoordinateInput('91.0, 10.0'), InvalidCoordinatesError);
    assert.throws(() => parseWholeCoordinateInput('10.0, 181.0'), InvalidCoordinatesError);
    assert.throws(() => parseWholeCoordinateInput('0.0, 0.0'), InvalidCoordinatesError);
  });

  it('finds an embedded pair only with a comma separator', () => {
    assert.deepEqual(findEmbeddedCoordinates('School No. 5 (47.9206526, 106.9662756)'), SCHOOL_PLACE);
    assert.equal(findEmbeddedCoordinates('Room 1.2 3.4'), null);
  });
});

describe('Google Maps link parsing', () => {
  it('prefers place coordinates (!3d!4d) over map-centre (@) for the supplied link', () => {
    const hit = extractCoordinates(FULL_LINK, { isUrl: true, pick: 'last' });
    assert.ok(hit);
    assert.equal(hit.kind, 'place-data');
    assert.deepEqual(hit.coordinates, SCHOOL_PLACE);
    assert.notDeepEqual(hit.coordinates, MAP_CENTER);
  });

  it('falls back to @ map-centre only when there is no place data', () => {
    const hit = extractCoordinates('https://www.google.com/maps/@47.9232031,106.9622216,15z', { isUrl: true, pick: 'last' });
    assert.equal(hit?.kind, 'map-center');
    assert.deepEqual(hit?.coordinates, MAP_CENTER);
  });

  it('reads q=, query= and destination= pins, including %2C encoding', () => {
    for (const url of [
      'https://maps.google.com/?q=47.9206526,106.9662756',
      'https://www.google.com/maps/search/?api=1&query=47.9206526%2C106.9662756',
      'https://www.google.com/maps/dir/?api=1&destination=47.9206526,106.9662756',
    ]) {
      const hit = extractCoordinates(url, { isUrl: true, pick: 'last' });
      assert.equal(hit?.kind, 'pin-param', url);
      assert.deepEqual(hit?.coordinates, SCHOOL_PLACE, url);
    }
  });

  it('uses the last !3d!4d in a directions link (the destination) and ignores the origin', () => {
    const url =
      'https://www.google.com/maps/dir/A/B/@47.9,106.9,12z/data=!4m2!4m1!3e0!1m0!3d47.1111111!4d106.1111111!1m0!3d47.9206526!4d106.9662756';
    assert.deepEqual(extractCoordinates(url, { isUrl: true, pick: 'last' })?.coordinates, SCHOOL_PLACE);
  });

  it('handles negative coordinates', () => {
    const hit = extractCoordinates('https://www.google.com/maps/place/X/data=!3d-33.8688197!4d151.2092955', { isUrl: true, pick: 'last' });
    assert.deepEqual(hit?.coordinates, { latitude: -33.8688197, longitude: 151.2092955 });
  });

  it('ignores out-of-range matches', () => {
    assert.equal(extractCoordinates('https://www.google.com/maps/place/X/data=!3d95.1!4d200.2', { isUrl: true, pick: 'last' }), null);
  });

  it('extracts a place name from links that have no coordinates', () => {
    assert.equal(extractPlaceQuery('https://www.google.com/maps/place/School+No.+5,+Ulaanbaatar/'), 'School No. 5, Ulaanbaatar');
    assert.equal(extractPlaceQuery('https://www.google.com/maps/search/?api=1&query=Ulaanbaatar+School+5'), 'Ulaanbaatar School 5');
    assert.equal(extractPlaceQuery('https://www.google.com/maps/@47.9,106.9,15z'), null);
  });

  it('recognises short links and finds URLs in pasted text', () => {
    assert.equal(isShortMapLink(SHORT_LINK), true);
    assert.equal(isShortMapLink('https://goo.gl/maps/abc123'), true);
    assert.equal(isShortMapLink(FULL_LINK), false);
    assert.equal(findUrlInText(`My school: ${SHORT_LINK} thanks`), SHORT_LINK);
    assert.equal(findUrlInText('maps.app.goo.gl/RNDPC49VB4Z1bVFp8'), SHORT_LINK);
    assert.equal(findUrlInText('Peace Avenue 12, Ulaanbaatar'), null);
  });
});

describe('response page parsing', () => {
  it('finds place coordinates in an embedded Google Maps URL with escaped characters', () => {
    const page = `<html><head><meta property="og:url" content="${FULL_LINK.replace(/&/g, '&amp;')}"></head></html>`;
    assert.deepEqual(extractCoordinatesFromBody(page)?.coordinates, SCHOOL_PLACE);
  });

  it('decodes \\u003d style JS escapes and prefers place data over map centre', () => {
    const page = `var x="https:\\/\\/www.google.com\\/maps\\/@${MAP_CENTER.latitude},${MAP_CENTER.longitude},15z"; var y="\\u00213d47.9206526\\u00214d106.9662756";`;
    const hit = extractCoordinatesFromBody(page);
    assert.equal(hit?.kind, 'place-data');
    assert.deepEqual(hit?.coordinates, SCHOOL_PLACE);
  });

  it('uses a static-map centre= parameter as a last resort', () => {
    const page = '<meta content="https://maps.google.com/maps/api/staticmap?center=47.9232031%2C106.9622216&zoom=15" property="og:image">';
    const hit = extractCoordinatesFromBody(page);
    assert.equal(hit?.kind, 'map-center');
    assert.deepEqual(hit?.coordinates, MAP_CENTER);
  });

  it('returns null when the page has nothing usable', () => {
    assert.equal(extractCoordinatesFromBody('<html><body>Hello</body></html>'), null);
  });
});
