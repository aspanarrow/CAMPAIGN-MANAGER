import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';

type AIProvider = 'opencode' | 'gemini';

/**
 * AI Content Generation Service
 *
 * Primary provider: OpenCode Go — an OpenAI-compatible chat completions API
 *   (https://opencode.ai/zen/go/v1/chat/completions).
 * Fallback provider: Google Gemini (kept for backwards compatibility).
 *
 * Select with AI_PROVIDER=opencode|gemini (default: opencode).
 */
class AIService {
  private provider: AIProvider;
  private genAI?: GoogleGenerativeAI;

  // --- Gemini (fallback) ---
  private geminiModel: string = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  // --- OpenCode Go (primary) ---
  private opencodeBaseUrl: string = (
    process.env.OPENCODE_BASE_URL || 'https://opencode.ai/zen/go/v1'
  ).replace(/\/+$/, '');
  // Cheap, fast open model available on the Go plan.
  private opencodeModel: string = process.env.OPENCODE_MODEL || 'mimo-v2.6-flash';
  private opencodeApiKey: string = process.env.OPENCODE_API_KEY || '';

  constructor() {
    const requested = (process.env.AI_PROVIDER || 'opencode').toLowerCase();
    this.provider = requested === 'gemini' ? 'gemini' : 'opencode';

    if (this.provider === 'opencode') {
      if (!this.opencodeApiKey) {
        logger.warn(
          'OpenCode API key not configured (OPENCODE_API_KEY missing) — AI generation will fail'
        );
      } else {
        logger.info(`AI provider: OpenCode Go (${this.opencodeModel})`);
      }
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.warn('Gemini API key not configured');
      return;
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    logger.info(`AI provider: Gemini (${this.geminiModel})`);
  }

  /**
   * Send a prompt to the active provider and return the generated text.
   */
  private async complete(
    prompt: string,
    opts: { temperature?: number; maxOutputTokens?: number } = {}
  ): Promise<string> {
    const { temperature = 0.8, maxOutputTokens = 1000 } = opts;

    if (this.provider === 'gemini') {
      if (!this.genAI) {
        throw new Error('Gemini is not configured. Set GEMINI_API_KEY or switch AI_PROVIDER.');
      }
      const model = this.genAI.getGenerativeModel({
        model: this.geminiModel,
        generationConfig: { temperature, maxOutputTokens },
      });
      const result = await model.generateContent(prompt);
      return result.response.text() || '';
    }

    // OpenCode Go — OpenAI-compatible /chat/completions
    if (!this.opencodeApiKey) {
      throw new Error('OpenCode is not configured. Set OPENCODE_API_KEY in the environment.');
    }

    const { httpFetch } = await import('../utils/http');
    const res = await httpFetch(`${this.opencodeBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opencodeApiKey}`,
        'User-Agent': 'shopify-marketing-ai/1.0',
        'x-opencode-session': 'shopify-marketing-ai',
      },
      body: JSON.stringify({
        model: this.opencodeModel,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxOutputTokens,
      }),
    }, { label: 'opencode', timeoutMs: 60000, retries: 2 });

    const text = res.text;
    if (!res.ok) {
      throw new Error(`OpenCode request failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }

    const data: any = res.json;

    if (data.error) {
      const msg = data.error.message || JSON.stringify(data.error);
      throw new Error(`OpenCode error: ${msg}`);
    }

    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * Generate ad copy for Meta/Google Ads
   */
  async generateAdCopy(params: {
    productName: string;
    productDescription: string;
    targetAudience: string;
    platform: 'meta' | 'google';
    tone?: 'professional' | 'casual' | 'luxury' | 'friendly';
    numberOfVariations?: number;
  }): Promise<{
    headlines: string[];
    descriptions: string[];
    callToActions: string[];
  }> {
    try {
      const prompt = this.buildAdCopyPrompt(params);

      const fullPrompt = `You are an expert copywriter specializing in high-converting ad copy for e-commerce. Generate compelling, action-oriented ad copy that drives clicks and conversions.\n\n${prompt}`;

      const content = await this.complete(fullPrompt, {
        temperature: 0.8,
        maxOutputTokens: 1000,
      });
      return this.parseAdCopyResponse(content, params.numberOfVariations || 3);
    } catch (error: any) {
      logger.error('Error generating ad copy', { error: error.message, params });
      throw new Error(`Failed to generate ad copy: ${error.message}`);
    }
  }

  /**
   * Generate product description
   */
  async generateProductDescription(params: {
    productName: string;
    currentDescription: string;
    keyFeatures: string[];
    targetAudience: string;
    seoKeywords?: string[];
  }): Promise<string> {
    try {
      const prompt = `Rewrite and enhance this product description to be more compelling and SEO-optimized:

Product: ${params.productName}
Current Description: ${params.currentDescription}
Key Features: ${params.keyFeatures.join(', ')}
Target Audience: ${params.targetAudience}
${params.seoKeywords ? `SEO Keywords to include: ${params.seoKeywords.join(', ')}` : ''}

Requirements:
- Highlight benefits, not just features
- Use persuasive language
- Include SEO keywords naturally
- Keep it concise (150-200 words)
- Make it scannable with short paragraphs
- Include a clear call-to-action`;

      const fullPrompt = `You are an expert e-commerce copywriter specializing in product descriptions that convert visitors into customers.\n\n${prompt}`;

      return this.complete(fullPrompt, { temperature: 0.7, maxOutputTokens: 500 });
    } catch (error: any) {
      logger.error('Error generating product description', { error: error.message, params });
      throw new Error(`Failed to generate product description: ${error.message}`);
    }
  }

  /**
   * Generate email subject lines
   */
  async generateEmailSubjectLines(params: {
    emailType: 'promotional' | 'abandoned_cart' | 'welcome' | 'newsletter';
    productName?: string;
    discount?: number;
    numberOfVariations?: number;
  }): Promise<string[]> {
    try {
      const prompt = this.buildEmailSubjectPrompt(params);

      const fullPrompt = `You are an expert email marketer. Generate compelling subject lines that maximize open rates.\n\n${prompt}`;

      const content = await this.complete(fullPrompt, {
        temperature: 0.9,
        maxOutputTokens: 300,
      });
      return this.parseListResponse(content, params.numberOfVariations || 5);
    } catch (error: any) {
      logger.error('Error generating email subject lines', { error: error.message, params });
      throw new Error(`Failed to generate email subjects: ${error.message}`);
    }
  }

  /**
   * Generate email body content
   */
  async generateEmailBody(params: {
    emailType: 'promotional' | 'abandoned_cart' | 'welcome' | 'newsletter';
    subject: string;
    productName?: string;
    productDescription?: string;
    discount?: number;
    customerName?: string;
    tone?: 'professional' | 'casual' | 'friendly';
  }): Promise<string> {
    try {
      const prompt = this.buildEmailBodyPrompt(params);

      const fullPrompt = `You are an expert email copywriter. Write engaging, conversion-focused email content.\n\n${prompt}`;

      return this.complete(fullPrompt, { temperature: 0.8, maxOutputTokens: 800 });
    } catch (error: any) {
      logger.error('Error generating email body', { error: error.message, params });
      throw new Error(`Failed to generate email body: ${error.message}`);
    }
  }

  /**
   * Analyze campaign performance and provide recommendations
   */
  async analyzePerformanceAndRecommend(params: {
    campaignMetrics: any;
    currentSpend: number;
    currentRevenue: number;
    roas: number;
    targetRoas: number;
  }): Promise<{
    analysis: string;
    recommendations: string[];
    suggestedActions: string[];
  }> {
    try {
      const prompt = `Analyze this marketing campaign performance and provide recommendations:

Current Metrics:
- Spend: ₹${params.currentSpend}
- Revenue: ₹${params.currentRevenue}
- ROAS: ${params.roas}x
- Target ROAS: ${params.targetRoas}x

Campaign Details:
${JSON.stringify(params.campaignMetrics, null, 2)}

Provide:
1. A brief analysis of performance
2. 3-5 specific recommendations
3. Suggested actions (e.g., "increase budget by 20%", "pause underperforming ads", "test new creative")`;

      const fullPrompt = `You are a marketing analytics expert. Provide data-driven recommendations for campaign optimization.\n\n${prompt}`;

      const content = await this.complete(fullPrompt, {
        temperature: 0.6,
        maxOutputTokens: 1000,
      });
      return this.parseAnalysisResponse(content);
    } catch (error: any) {
      logger.error('Error analyzing performance', { error: error.message, params });
      throw new Error(`Failed to analyze performance: ${error.message}`);
    }
  }

  // Helper methods
  private buildAdCopyPrompt(params: any): string {
    return `Generate ${params.numberOfVariations || 3} variations of ad copy for:

Product: ${params.productName}
Description: ${params.productDescription}
Platform: ${params.platform}
Target Audience: ${params.targetAudience}
Tone: ${params.tone || 'professional'}

For each variation, provide:
- 1 headline (${params.platform === 'meta' ? '40 characters max' : '30 characters max'})
- 1 description (${params.platform === 'meta' ? '125 characters max' : '90 characters max'})
- 1 call-to-action button text

Format as JSON with arrays: {headlines: [], descriptions: [], callToActions: []}`;
  }

  private buildEmailSubjectPrompt(params: any): string {
    let prompt = `Generate ${params.numberOfVariations || 5} email subject lines for a ${params.emailType} email.`;
    
    if (params.productName) prompt += `\nProduct: ${params.productName}`;
    if (params.discount) prompt += `\nDiscount: ${params.discount}% off`;
    
    prompt += '\n\nMake them compelling, personalized, and optimized for open rates. Return as a numbered list.';
    
    return prompt;
  }

  private buildEmailBodyPrompt(params: any): string {
    let prompt = `Write an email body for a ${params.emailType} email.\n\nSubject: ${params.subject}\n`;
    
    if (params.customerName) prompt += `Recipient: ${params.customerName}\n`;
    if (params.productName) prompt += `Product: ${params.productName}\n`;
    if (params.productDescription) prompt += `Product Description: ${params.productDescription}\n`;
    if (params.discount) prompt += `Discount: ${params.discount}% off\n`;
    
    prompt += `Tone: ${params.tone || 'friendly'}\n\nMake it engaging, conversion-focused, and include a clear call-to-action.`;
    
    return prompt;
  }

  private parseAdCopyResponse(content: string, count: number): any {
    // Keys the caller relies on; always guaranteed to be non-empty arrays.
    const ensureShape = (raw: any): any => {
      const pick = (...keys: string[]): string[] => {
        for (const k of keys) {
          const v = raw && raw[k];
          if (Array.isArray(v) && v.length) return v.filter(Boolean).map((s) => String(s).trim());
        }
        return [];
      };
      const headlines = pick('headlines', 'headline', 'titles', 'title').slice(0, count);
      const descriptions = pick('descriptions', 'description', 'bodies', 'body').slice(0, count);
      const callToActions = pick('callToActions', 'call_to_actions', 'ctas', 'cta', 'buttons').slice(0, count);

      return {
        headlines: headlines.length ? headlines : ['Check out our amazing product!'],
        descriptions: descriptions.length
          ? descriptions
          : ['Discover the perfect solution for your needs.'],
        callToActions: callToActions.length ? callToActions : ['Shop Now'],
      };
    };

    try {
      // Try to parse as JSON first (models may add prose around the JSON).
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return ensureShape(JSON.parse(jsonMatch[0]));
        } catch {
          // fall through to text parsing
        }
      }

      // Fallback: parse from text format
      const headlines: string[] = [];
      const descriptions: string[] = [];
      const callToActions: string[] = [];

      const lines = content.split('\n').filter((line) => line.trim());
      lines.forEach((line) => {
        if (/headline/i.test(line)) {
          const match = line.match(/headline[:\-]?\s*(.+)/i);
          if (match) headlines.push(match[1].trim());
        } else if (/description/i.test(line)) {
          const match = line.match(/description[:\-]?\s*(.+)/i);
          if (match) descriptions.push(match[1].trim());
        } else if (/cta|call[-\s]?to[-\s]?action/i.test(line)) {
          const match = line.match(/(?:cta|call[-\s]to[-\s]action)[:\-]?\s*(.+)/i);
          if (match) callToActions.push(match[1].trim());
        }
      });

      return ensureShape({ headlines, descriptions, callToActions });
    } catch (error) {
      logger.error('Error parsing ad copy response', { error, content });
      // Return default structure
      return {
        headlines: ['Check out our amazing product!'],
        descriptions: ['Discover the perfect solution for your needs.'],
        callToActions: ['Shop Now'],
      };
    }
  }

  private parseListResponse(content: string, count: number): string[] {
    const items: string[] = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      // Match numbered lists (1., 2., etc.) or bullet points
      const match = line.match(/^[\d\-\*•]\s*(.+)/);
      if (match) {
        items.push(match[1].trim());
      } else if (line.trim() && items.length < count) {
        items.push(line.trim());
      }
    });
    
    return items.slice(0, count);
  }

  private parseAnalysisResponse(content: string): any {
    const recommendations: string[] = [];
    const suggestedActions: string[] = [];
    
    const lines = content.split('\n').filter(line => line.trim());
    let currentSection = '';
    
    lines.forEach(line => {
      if (line.toLowerCase().includes('recommendation')) {
        currentSection = 'recommendations';
      } else if (line.toLowerCase().includes('action') || line.toLowerCase().includes('suggest')) {
        currentSection = 'actions';
      } else if (line.match(/^[\d\-\*•]/)) {
        const match = line.match(/^[\d\-\*•]\s*(.+)/);
        if (match) {
          if (currentSection === 'recommendations') {
            recommendations.push(match[1].trim());
          } else if (currentSection === 'actions') {
            suggestedActions.push(match[1].trim());
          }
        }
      }
    });
    
    return {
      analysis: content.split('\n\n')[0] || content,
      recommendations: recommendations.length > 0 ? recommendations : ['Monitor performance closely', 'Test new creative variations'],
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : ['Review campaign settings'],
    };
  }
}

export const aiService = new AIService();
export default aiService;

