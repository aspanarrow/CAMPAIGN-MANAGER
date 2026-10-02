import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import { logger } from '../utils/logger';

/**
 * Shopify Admin API Service
 * Handles all interactions with Shopify store
 */
class ShopifyService {
  private client: any;
  private storeUrl: string;
  private accessToken: string;

  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL || '';
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';

    if (!this.storeUrl || !this.accessToken) {
      logger.warn('Shopify credentials not configured');
      return;
    }

    // Initialize Shopify API client
    const shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY || '',
      apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
      scopes: ['read_products', 'read_orders', 'read_customers'],
      hostName: process.env.SHOPIFY_STORE_URL?.replace('https://', '').replace('http://', '') || '',
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: false,
    });

    const session = shopify.session.customAppSession(this.storeUrl);
    session.accessToken = this.accessToken;

    this.client = new shopify.clients.Rest({ session });
  }

  /**
   * Get all products from store
   */
  async getProducts(limit: number = 50): Promise<any[]> {
    try {
      const response = await this.client.get({
        path: 'products',
        query: { limit },
      });
      return response.body.products || [];
    } catch (error: any) {
      logger.error('Error fetching products from Shopify', { error: error.message });
      throw new Error(`Failed to fetch products: ${error.message}`);
    }
  }

  /**
   * Get a specific product by ID
   */
  async getProduct(productId: string): Promise<any> {
    try {
      const response = await this.client.get({
        path: `products/${productId}`,
      });
      return response.body.product;
    } catch (error: any) {
      logger.error('Error fetching product from Shopify', { error: error.message, productId });
      throw new Error(`Failed to fetch product: ${error.message}`);
    }
  }

  /**
   * Get orders (used for revenue attribution). `since` is an ISO date string.
   */
  async getOrders(opts: { since?: string; limit?: number; status?: string } = {}): Promise<any[]> {
    try {
      const query: Record<string, any> = {
        limit: opts.limit ?? 250,
        status: opts.status ?? 'any',
        fields: 'id,name,created_at,total_price,currency,landing_site,referring_site,source_name,note_attributes,line_items',
      };
      if (opts.since) query.created_at_min = opts.since;

      const response = await this.client.get({ path: 'orders', query });
      return response.body.orders || [];
    } catch (error: any) {
      logger.error('Error fetching orders from Shopify', { error: error.message });
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }
  }

  /**
   * Get top-selling products
   */
  async getTopProducts(limit: number = 10): Promise<any[]> {
    try {
      // Get recent orders to determine top products
      const ordersResponse = await this.client.get({
        path: 'orders',
        query: { limit: 250, status: 'any' },
      });

      const orders = ordersResponse.body.orders || [];
      
      // Count product sales
      const productSales: Record<string, { product: any; sales: number }> = {};
      
      orders.forEach((order: any) => {
        order.line_items?.forEach((item: any) => {
          const productId = item.product_id?.toString();
          if (productId) {
            if (!productSales[productId]) {
              productSales[productId] = {
                product: { id: productId, title: item.title },
                sales: 0,
              };
            }
            productSales[productId].sales += item.quantity;
          }
        });
      });

      // Sort by sales and return top products
      const topProducts = Object.values(productSales)
        .sort((a, b) => b.sales - a.sales)
        .slice(0, limit)
        .map(item => item.product);

      return topProducts;
    } catch (error: any) {
      logger.error('Error fetching top products from Shopify', { error: error.message });
      throw new Error(`Failed to fetch top products: ${error.message}`);
    }
  }

  /**
   * Get store analytics data
   */
  async getStoreAnalytics(): Promise<any> {
    try {
      // Get recent orders for analytics
      const ordersResponse = await this.client.get({
        path: 'orders',
        query: { limit: 250, status: 'any' },
      });

      const orders = ordersResponse.body.orders || [];
      
      const analytics = {
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum: number, order: any) => sum + parseFloat(order.total_price || 0), 0),
        averageOrderValue: 0,
        orderCount: orders.length,
      };

      analytics.averageOrderValue = analytics.totalRevenue / (analytics.orderCount || 1);

      return analytics;
    } catch (error: any) {
      logger.error('Error fetching store analytics from Shopify', { error: error.message });
      throw new Error(`Failed to fetch analytics: ${error.message}`);
    }
  }

  /**
   * Test connection to Shopify
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.get({ path: 'shop' });
      return true;
    } catch (error) {
      logger.error('Shopify connection test failed', { error });
      return false;
    }
  }
}

export const shopifyService = new ShopifyService();
export default shopifyService;

