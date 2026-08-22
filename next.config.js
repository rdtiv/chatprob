/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // geist ships next/font/local imports from node_modules; without this the
  // pages-router build's "collecting page data" step evaluates that file
  // through Node's own ESM resolver (which has no exports map for
  // next/font/local on this Next version) instead of Next's font loader.
  transpilePackages: ['geist'],
}

module.exports = nextConfig 