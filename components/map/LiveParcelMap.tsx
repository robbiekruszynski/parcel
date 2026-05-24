/**
 * LiveParcelMap.tsx — legacy shim
 *
 * The map screen now uses ParcelMap + ParcelRecordingOverlay directly.
 * This file is kept only so any lingering imports don't break the build.
 * It simply re-exports ParcelMap as a drop-in stand-in.
 */
export { ParcelMap as LiveParcelMap } from '@/components/ParcelMap';
