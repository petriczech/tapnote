import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

// Nová instance komponenty při změně parametrů routy
export class ParamsRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return (
      future.routeConfig === curr.routeConfig && JSON.stringify(future.params) === JSON.stringify(curr.params)
    );
  }
}
