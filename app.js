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

// Enhanced orders endpoint with debug info
app.get('/orders', async (req, res) => {
  try {
    const params = {};
    
    // Only test pagination first
    if (req.query.page) params.page = parseInt(req.query.page);
    if (req.query.pageSize) params.pageSize = parseInt(req.query.pageSize);
    
    // Log what we're sending
    console.log('Query params from request:', req.query);
    console.log('Params being sent to Billbee:', params);
    
    const response = await billbeeAPI.get('/orders', { params });
    
    console.log('Response pagination:', response.data.Paging);
    console.log('Full request URL would be:', `${BILLBEE_BASE_URL}/orders?${new URLSearchParams(params).toString()}`);
    
    res.json({
      debug: {
        receivedQuery: req.query,
        sentParams: params,
        fullUrl: `${BILLBEE_BASE_URL}/orders?${new URLSearchParams(params).toString()}`,
        actualPagination: response.data.Paging
      },
      pagination: response.data.Paging,
      orderCount: response.data.Data?.length || 0,
      firstOrderId: response.data.Data?.[0]?.Id || 'none',
      lastOrderId: response.data.Data?.[response.data.Data?.length - 1]?.Id || 'none'
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: error.message,
      details: error.response?.data
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