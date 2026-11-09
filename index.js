/**
 * dsh-price-period — Host half.
 *
 * The widget is entirely Client-side: the pricing clock is computed from the
 * browser's own clock, so nothing here needs a route, a timer, or a service.
 * The row exists only so the bundle has a Host entry the Loader can mount;
 * without it the Client half would never be served.
 */

export const name = 'dsh-price-period';

export function apply() {}
