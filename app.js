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

// Enhanced orders endpoint with query parameters
app.get('/orders', async (req, res) => {
  try {
    // Build query parameters
    const params = {};
    
    // Pagination
    if (req.query.page) params.page = req.query.page;
    if (req.query.pageSize) params.pageSize = req.query.pageSize;
    
    // Date filters
    if (req.query.createdAtMin) params.createdAtMin = req.query.createdAtMin;
    if (req.query.createdAtMax) params.createdAtMax = req.query.createdAtMax;
    if (req.query.modifiedAtMin) params.modifiedAtMin = req.query.modifiedAtMin;
    if (req.query.modifiedAtMax) params.modifiedAtMax = req.query.modifiedAtMax;
    
    // Order state filter (0-10, where 7 = shipped)
    if (req.query.state) params.orderStateId = req.query.state;
    
    // Shop/Platform filter
    if (req.query.shopId) params.shopId = req.query.shopId;
    
    // Tag filter
    if (req.query.tag) params.tag = req.query.tag;
    
    // Minimum order value
    if (req.query.minOrderValue) params.minOrderValue = req.query.minOrderValue;
    
    // Include archived orders
    if (req.query.includeArchived) params.includeArchived = req.query.includeArchived;

    const response = await billbeeAPI.get('/orders', { params });
    
    // Return structured response with metadata
    res.json({
      success: true,
      pagination: response.data.Paging,
      totalOrders: response.data.Paging.TotalRows,
      orders: response.data.Data,
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