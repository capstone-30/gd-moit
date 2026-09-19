import 'server-only';
import {handle} from '../../../../lib/controllers/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const PATCH=handle;
export const DELETE=handle;
