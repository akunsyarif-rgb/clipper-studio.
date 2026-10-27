/** @type {import('next').NextConfig} */
const nextConfig = {
  // The address of this very deployment (set by Vercel at build time, empty elsewhere). The studio compares it with the
  // address in the browser: storage is per address, so a deployment-only address cannot keep the speech model.
  env: { NEXT_PUBLIC_DEPLOYMENT_HOST: process.env.VERCEL_URL ?? "" },
};

export default nextConfig;
