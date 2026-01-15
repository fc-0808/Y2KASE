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
		formats: ['image/avif', 'image/webp'],
	},
}

export default nextConfig
