/**
 * The supervisor's view of one order — the same screen the admin uses.
 *
 * It did not exist, and every order a supervisor clicked led to an English 404: the board and
 * the order list linked to `/supervisor/orders/<no>`, which had no page, or to `/admin/orders/<no>`,
 * which the middleware bounces a supervisor away from. So the person whose whole job is confirming,
 * packing and dispatching orders could not open one.
 *
 * Re-using the admin page is safe because that page draws nothing on its own authority: every
 * action on it is a call the API checks against the supervisor's own permissions.
 */
export { default, dynamic } from '../../../admin/orders/[orderNumber]/page';
