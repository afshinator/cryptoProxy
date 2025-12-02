// api/blob-example.js
/**
 * Example endpoint demonstrating Vercel Blob storage usage
 * This is optional - remove if you don't need blob storage
 */
import { put, list, head, del } from '@vercel/blob';

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (!token) {
    return res.status(500).json({ 
      error: 'BLOB_READ_WRITE_TOKEN environment variable is not defined',
      message: 'Please set BLOB_READ_WRITE_TOKEN in your Vercel project settings'
    });
  }

  try {
    switch (req.method) {
      case 'GET':
        // List all blobs
        const { blobs } = await list({ token });
        return res.status(200).json({ blobs });

      case 'POST':
        // Upload a blob (requires file in request)
        // Example: const blob = await put('filename.txt', file, { access: 'public', token });
        return res.status(200).json({ 
          message: 'Blob upload endpoint - implement file upload logic here'
        });

      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    return res.status(500).json({ 
      error: 'Blob operation failed',
      message: error.message 
    });
  }
}

