// Filename: api/pages/landing.ts

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Color constants
const COLORS = {
  PRIMARY_START: '#667eea',
  PRIMARY_END: '#764ba2',
  BANNER_BG: 'white',
  SHADOW: 'rgba(0, 0, 0, 0.3)',
  HEADING: '#667eea',
  TEXT: '#666',
} as const;

export function serveLandingPage(req: VercelRequest, res: VercelResponse): void {
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
      background: linear-gradient(135deg, ${COLORS.PRIMARY_START} 0%, ${COLORS.PRIMARY_END} 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }

    .banner {
      background: ${COLORS.BANNER_BG};
      border-radius: 16px;
      box-shadow: 0 20px 60px ${COLORS.SHADOW};
      padding: 4rem 3rem;
      text-align: center;
      max-width: 600px;
      width: 100%;
    }

    .banner h1 {
      font-size: 2.5rem;
      color: ${COLORS.HEADING};
      margin-bottom: 1rem;
      font-weight: 700;
    }

    .banner p {
      font-size: 1.25rem;
      color: ${COLORS.TEXT};
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
  res.status(200).send(landingPage);
}
