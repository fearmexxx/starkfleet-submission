import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Turbopack configuration for Next.js 16+
  // Required for Cartridge Controller WebAssembly cryptographic operations
  turbopack: {
    // Empty config silences the webpack warning while Turbopack is enabled
  },
  // Webpack config (used when running with --webpack flag or for fallback)
  webpack: (config, { isServer, dev }) => {
    config.output.environment = {
      ...config.output.environment,
      asyncFunction: true,
    };

    // Enable WebAssembly support (required by Cartridge Controller)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
    };

    return config;
  },
};

export default nextConfig;
