/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Enable static exports for the App Router.
   *
   * @see https://nextjs.org/docs/app/building-your-application/deploying/static-exports
   */
  output: "export",

  /**
   * Base path for deployment.
   * Use empty string for root, or repository name for subdirectory (e.g., /callgraphs-generator)
   */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  /**
   * trailingSlash for proper static export routing
   */
  trailingSlash: true,

  /**
   * Disable server-based image optimization. Next.js does not support
   * dynamic features with static exports.
   *
   * @see https://nextjs.org/docs/app/api-reference/components/image#unoptimized
   */
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
