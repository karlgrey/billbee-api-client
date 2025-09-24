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

// Final endpoint for zero-value orders - searches ALL pages
app.get('/orders/zero-value', async (req, res) => {
  try {
    let allZeroValueOrders = [];
    let currentPage = 1;
    let totalPages = 1; // We'll update this after the first request
    
    // Search ALL pages
    while (currentPage <= totalPages) {
      const params = {
        page: currentPage,
        pageSize: 250, // Maximum allowed by API
      };
      
      if (req.query.minOrderDate) params.minOrderDate = req.query.minOrderDate;
      if (req.query.maxOrderDate) params.maxOrderDate = req.query.maxOrderDate;
      if (req.query.shopId) params.shopId = req.query.shopId;
      
      const response = await billbeeAPI.get('/orders', { params });
      
      // Update total pages from API response
      totalPages = response.data.Paging.TotalPages;
      
      // Enhanced zero-value detection
      const zeroValueFromThisPage = response.data.Data.filter(order => 
        order.TotalCost === 0 || 
        order.TotalCost === null || 
        order.TotalCost === "0" ||
        order.TotalCost === 0.0 ||
        Math.abs(order.TotalCost) < 0.01
      );
      
      allZeroValueOrders = allZeroValueOrders.concat(zeroValueFromThisPage);
      
      currentPage++;
      
      // Optional: Log progress for long-running searches
      if (currentPage % 10 === 0) {
        console.log(`Processed ${currentPage - 1}/${totalPages} pages, found ${allZeroValueOrders.length} zero-value orders so far`);
      }
    }
    
    res.json({
      success: true,
      description: "ALL orders with total value of 0 EUR",
      totalZeroValueOrders: allZeroValueOrders.length,
      orders: allZeroValueOrders,
      searchedPages: totalPages,
      totalOrdersInSystem: "All pages searched"
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