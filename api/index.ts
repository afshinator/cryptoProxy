import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readFileSync } from 'fs';
import { join } from 'path';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Check if 'magic' query parameter is present
  const hasMagic = req.query.magic !== undefined;

  if (hasMagic) {
    // Serve the full index.html
    const htmlPath = join(process.cwd(), 'public', 'index.html');
    const htmlContent = readFileSync(htmlPath, 'utf-8');
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlContent);
  } else {
    // Serve the simple landing page
    const landingPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CryptoSpect - Coming Soon</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .banner {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 4rem 3rem;
      text-align: center;
      max-width: 600px;
      width: 100%;
    }

    .banner h1 {
      font-size: 2.5rem;
      color: #667eea;
      margin-bottom: 1rem;
      font-weight: 700;
    }

    .banner p {
      font-size: 1.25rem;
      color: #666;
      line-height: 1.6;
    }

    @media (max-width: 600px) {
      .banner {
        padding: 3rem 2rem;
      }

      .banner h1 {
        font-size: 2rem;
      }

      .banner p {
        font-size: 1.1rem;
      }
    }
  </style>
</head>
<body>
  <div class="banner">
    <h1>Hello 👋</h1>
    <p>Future home of CryptoSpect app foundations</p>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(landingPage);
  }
}
