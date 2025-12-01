/**
 * Simple endpoint that echoes a secret key from environment variables
 * This is a proof of concept to demonstrate secure secret management
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the secret key from environment variables
  const secretKey = process.env.SECRET_KEY;

  // Check if secret key is defined
  if (!secretKey) {
    return res.status(500).json({ 
      error: 'SECRET_KEY environment variable is not defined',
      message: 'Please set SECRET_KEY in your Vercel project settings or .env.local file'
    });
  }

  // Return the secret key (in production, you might want to mask this)
  return res.status(200).json({ 
    secretKey,
    message: 'Secret key retrieved successfully'
  });
}

