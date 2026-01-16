/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'images.unsplash.com',
			},
			{
				protocol: 'https',
				hostname: 'bvqtaytvxcnpxdefajxz.supabase.co',
			},
		],
	},
	experimental: {
		serverActions: {
			bodySizeLimit: '50mb',
		},
	},
}

export default nextConfig
