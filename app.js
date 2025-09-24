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

// Specific endpoint for zero-value orders
app.get('/orders/zero-value', async (req, res) => {
  try {
    const params = {
      minTotalValue: 0,
      maxTotalValue: 0, // This should filter for exactly 0 EUR
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize) : 50
    };
    
    // Allow pagination for zero-value orders
    if (req.query.page) params.page = parseInt(req.query.page);

    const response = await billbeeAPI.get('/orders', { params });
    
    res.json({
      success: true,
      description: "Orders with total value of 0 EUR",
      pagination: response.data.Paging,
      totalZeroValueOrders: response.data.Paging?.TotalRows || 0,
      orders: response.data.Data || [],
      endpoint: "GET /orders/zero-value",
      queryParams: "?page=1&pageSize=50 (optional)"
    });
    
  } catch (error) {
    console.error('Error fetching zero-value orders:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch zero-value orders',
      details: error.message 
    });
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