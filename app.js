require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Billbee API configuration
const BILLBEE_BASE_URL = 'https://app.billbee.io/api/v1';
const apiKey = process.env.BILLBEE_API_KEY;
const username = process.env.BILLBEE_USER;
const password = process.env.BILLBEE_PASSWORD;

// Create axios instance with auth
const billbeeAPI = axios.create({
  baseURL: BILLBEE_BASE_URL,
  headers: {
    'X-Billbee-Api-Key': apiKey,
    'Content-Type': 'application/json'
  },
  auth: {
    username: username,
    password: password
  }
});

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Billbee API Client is running!' });
});

// Enhanced orders endpoint with all parameters
app.get('/orders', async (req, res) => {
  try {
    const params = {};
    
    // Pagination
    if (req.query.page) params.page = parseInt(req.query.page);
    if (req.query.pageSize) params.pageSize = parseInt(req.query.pageSize);
    
    // Date filters (format: YYYY-MM-DDTHH:mm:ss)
    if (req.query.createdAtMin) params.createdAtMin = req.query.createdAtMin;
    if (req.query.createdAtMax) params.createdAtMax = req.query.createdAtMax;
    if (req.query.modifiedAtMin) params.modifiedAtMin = req.query.modifiedAtMin;
    if (req.query.modifiedAtMax) params.modifiedAtMax = req.query.modifiedAtMax;
    
    // Order state filter
    if (req.query.state) params.orderStateId = parseInt(req.query.state);
    
    // Shop filter
    if (req.query.shopId) params.shopId = parseInt(req.query.shopId);
    
    // Tag filter
    if (req.query.tag) params.tag = req.query.tag;
    
    // Minimum total value
    if (req.query.minTotalValue) params.minTotalValue = parseFloat(req.query.minTotalValue);

    const response = await billbeeAPI.get('/orders', { params });
    
    res.json({
      success: true,
      pagination: response.data.Paging,
      totalOrders: response.data.Paging?.TotalRows || 0,
      orders: response.data.Data || [],
      appliedFilters: params
    });
    
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// Endpoint for zero-value orders - human readable HTML output
app.get('/orders/zero-value', async (req, res) => {
  try {
    let allZeroValueOrders = [];
    let currentPage = 1;
    let hasMorePages = true;
    
    // Fetch multiple pages to find all zero-value orders
    while (hasMorePages && allZeroValueOrders.length < 1000) {
      const params = {
        page: currentPage,
        pageSize: 250,
      };
      
      if (req.query.minOrderDate) params.minOrderDate = req.query.minOrderDate;
      if (req.query.maxOrderDate) params.maxOrderDate = req.query.maxOrderDate;
      if (req.query.shopId) params.shopId = req.query.shopId;
      
      const response = await billbeeAPI.get('/orders', { params });
      
      const zeroValueFromThisPage = response.data.Data.filter(order => 
        order.TotalCost === 0
      );
      
      allZeroValueOrders = allZeroValueOrders.concat(zeroValueFromThisPage);
      
      hasMorePages = currentPage < response.data.Paging.TotalPages && currentPage < 10;
      currentPage++;
    }
    
    // Create human-readable HTML
    let html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Zero Value Orders</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background-color: #f5f5f5; }
            .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #333; border-bottom: 3px solid #007cba; padding-bottom: 10px; }
            .summary { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .order { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #007cba; }
            .order-header { font-weight: bold; color: #333; font-size: 16px; }
            .order-details { margin-top: 10px; color: #666; }
            .no-orders { text-align: center; color: #999; font-style: italic; padding: 40px; }
            .date { color: #007cba; }
            .status { background: #28a745; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Zero Value Orders Report</h1>
            <div class="summary">
                <strong>Total Orders Found:</strong> ${allZeroValueOrders.length}<br>
                <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
                <strong>Pages Searched:</strong> ${currentPage - 1}
            </div>
    `;
    
    if (allZeroValueOrders.length === 0) {
        html += `<div class="no-orders">No zero-value orders found.</div>`;
    } else {
        allZeroValueOrders.forEach(order => {
            const orderDate = new Date(order.CreatedAt).toLocaleDateString();
            const customer = order.Customer?.Name || '[Anonymous]';
            const platform = order.Seller?.Platform || 'Unknown';
            
            html += `
            <div class="order">
                <div class="order-header">Order #${order.OrderNumber}</div>
                <div class="order-details">
                    <strong>Date:</strong> <span class="date">${orderDate}</span><br>
                    <strong>Customer:</strong> ${customer}<br>
                    <strong>Platform:</strong> ${platform}<br>
                    <strong>Total Cost:</strong> €${order.TotalCost}<br>
                    <strong>Status:</strong> <span class="status">State ${order.State}</span><br>
                    <strong>Items:</strong> ${order.OrderItems?.length || 0}
                </div>
            </div>
            `;
        });
    }
    
    html += `
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
    
  } catch (error) {
    res.send(`
    <html>
    <body style="font-family: Arial; margin: 40px;">
        <h1 style="color: red;">Error</h1>
        <p>Failed to fetch zero-value orders: ${error.message}</p>
    </body>
    </html>
    `);
  }
});

// Get products example
app.get('/products', async (req, res) => {
  try {
    const response = await billbeeAPI.get('/products');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch products',
      details: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});