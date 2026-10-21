import { buildId, formatBuildStamp, loadBuildStamp } from './build-info';

/** Dokument s danými skripty; `buildId()` nesahá na nic jiného. */
function docWith(...sources: string[]): Document {
  const doc = document.implementation.createHTMLDocument('test');
  for (const src of sources) {
    const script = doc.createElement('script');
    script.setAttribute('src', src);
    doc.head.appendChild(script);
  }
  return doc;
}

describe('buildId', () => {
  it('reads the id from the hashed file name', () => {
    expect(buildId(docWith('main-HVVKIVEN.js'))).toBe('HVVKIVEN');
  });

  it('finds the main script among others regardless of the path', () => {
    expect(buildId(docWith('polyfills-ABC.js', '/main-QWE123.js'))).toBe('QWE123');
  });

  it('reports a dev build without a hash', () => {
    expect(buildId(docWith('main.js'))).toBe('dev');
  });

  it('does not break without scripts', () => {
    expect(buildId(docWith())).toBe('dev');
  });
});

describe('formatBuildStamp', () => {
  it('formats the build date and time in short form', () => {
    // Místní čas, ne UTC – razítko má odpovídat tomu, co uživatel vidí na hodinách.
    expect(formatBuildStamp(new Date(2026, 8, 21, 19, 55).getTime())).toBe('26.9.21-1955');
  });

  it('pads hours and minutes with zero but not month and day', () => {
    expect(formatBuildStamp(new Date(2026, 0, 5, 7, 3).getTime())).toBe('26.1.5-0703');
  });
});

describe('loadBuildStamp', () => {
  /** Odpověď serveru; `json()` se volá až po kontrole `ok`. */
  function respond(body: unknown, ok = true): typeof fetch {
    return () => Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);
  }

  it('takes the stamp from ngsw.json without the HTTP cache', async () => {
    const stamp = new Date(2026, 8, 21, 19, 55).getTime();
    const load = vi.fn(respond({ timestamp: stamp }));

    await expect(loadBuildStamp(load, docWith())).resolves.toBe('26.9.21-1955');
    expect(load).toHaveBeenCalledWith('ngsw.json', { cache: 'no-store' });
  });

  it('falls back to the script hash without ngsw.json', async () => {
    const failing: typeof fetch = () => Promise.reject(new Error('404'));

    await expect(loadBuildStamp(failing, docWith('main-HVVKIVEN.js'))).resolves.toBe('HVVKIVEN');
  });

  it('treats an unreadable stamp as missing', async () => {
    await expect(
      loadBuildStamp(respond({ timestamp: 'včera' }), docWith('main-QWE123.js')),
    ).resolves.toBe('QWE123');
  });

  it('reports dev on the development server', async () => {
    await expect(loadBuildStamp(respond({}, false), docWith())).resolves.toBe('dev');
  });
});
