import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from './app.routes';

describe('routes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  it('opens tasks for the empty path', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/tasks');
  });

  it('opens tasks for an unknown path', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/neexistuje');
    expect(router.url).toBe('/tasks');
  });

  it('keeps the new note route', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/new');
    expect(router.url).toBe('/new');
  });
});
