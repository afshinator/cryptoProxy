import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read the HTML file once
const htmlPath = join(process.cwd(), 'public', 'index.html');
const htmlContent = readFileSync(htmlPath, 'utf-8');

describe('Index Page Tests', () => {

  it('should exist and be readable', () => {
    expect(htmlContent).toBeTruthy();
    expect(htmlContent.length).toBeGreaterThan(0);
  });

  it('should have proper HTML structure', () => {
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<html lang="en">');
    expect(htmlContent).toContain('</html>');
    expect(htmlContent).toContain('<head>');
    expect(htmlContent).toContain('<body>');
  });

  it('should have the correct title', () => {
    expect(htmlContent).toContain('<title>Crypto Proxy - API Endpoints</title>');
  });

  it('should display the main header', () => {
    expect(htmlContent).toContain('🚀 Crypto Proxy API');
    expect(htmlContent).toContain('Available Serverless Endpoints');
  });

  it('should list the echo-secret endpoint', () => {
    expect(htmlContent).toContain('/api/echo-secret');
    expect(htmlContent).toContain('Echoes the');
    expect(htmlContent).toContain('SECRET_KEY');
    expect(htmlContent).toContain('Test Endpoint →');
  });

  it('should list the markets endpoint', () => {
    expect(htmlContent).toContain('/api/markets');
    expect(htmlContent).toContain('CoinGecko');
  });

  it('should list the blob-example endpoint', () => {
    expect(htmlContent).toContain('/api/blob-example');
    expect(htmlContent).toContain('Vercel Blob storage');
  });

  it('should list the volatility endpoint', () => {
    expect(htmlContent).toContain('/api/volatility');
    expect(htmlContent).toContain('VWATR');
    expect(htmlContent).toContain('Volume-Weighted Average True Range');
    expect(htmlContent).toContain('max: 30 days');
  });

  it('should have GET method badges for endpoints', () => {
    expect(htmlContent).toContain('method get');
    expect(htmlContent).toContain('method post');
  });

  it('should have test links for all endpoints', () => {
    const testLinkMatches = htmlContent.match(/href="\/api\/[^"]+"/g);
    expect(testLinkMatches).toBeTruthy();
    expect(testLinkMatches!.length).toBeGreaterThanOrEqual(4);
    expect(testLinkMatches!.some(link => link.includes('/api/echo-secret'))).toBe(true);
    expect(testLinkMatches!.some(link => link.includes('/api/markets'))).toBe(true);
    expect(testLinkMatches!.some(link => link.includes('/api/blob-example'))).toBe(true);
    expect(testLinkMatches!.some(link => link.includes('/api/volatility'))).toBe(true);
  });

  it('should have proper styling (CSS)', () => {
    expect(htmlContent).toContain('<style>');
    expect(htmlContent).toContain('</style>');
    expect(htmlContent).toContain('.container');
    expect(htmlContent).toContain('.endpoint');
  });

  it('should have footer with Vercel branding', () => {
    expect(htmlContent).toContain('Powered by Vercel Serverless Functions');
  });

  it('should be responsive (have media queries)', () => {
    expect(htmlContent).toContain('@media');
  });
});

