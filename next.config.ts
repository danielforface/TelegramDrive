
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // For client-side bundle, provide fallbacks for Node.js core modules
      // that some libraries might try to import.
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}), // Spread existing fallbacks if any
        fs: false, // graceful-fs and others might try to use this
        path: false, // some libs might use this
        // crypto: false, // if crypto issues arise, add this. Browser has window.crypto
                         // but some libs might try to 'require' the node module.
      };
    }
    return config;
  },
};

export default nextConfig;
