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

// Enhanced endpoint with extracted comment field
app.get('/orders/zero-value', async (req, res) => {
  try {
    let allZeroValueOrders = [];
    let currentPage = 1;
    let totalPages = 1;
    
    // Search ALL pages
    while (currentPage <= totalPages) {
      const params = {
        page: currentPage,
        pageSize: 250,
      };
      
      if (req.query.minOrderDate) params.minOrderDate = req.query.minOrderDate;
      if (req.query.maxOrderDate) params.maxOrderDate = req.query.maxOrderDate;
      if (req.query.shopId) params.shopId = req.query.shopId;
      
      const response = await billbeeAPI.get('/orders', { params });
      totalPages = response.data.Paging.TotalPages;
      
      // Enhanced zero-value detection
      let zeroValueFromThisPage = response.data.Data.filter(order => 
        order.TotalCost === 0 || 
        order.TotalCost === null || 
        order.TotalCost === "0" ||
        order.TotalCost === 0.0 ||
        Math.abs(order.TotalCost) < 0.01
      );
      
      // Apply seller comment filter if provided
      if (req.query.sellerComment) {
        const searchTerm = req.query.sellerComment.toLowerCase();
        zeroValueFromThisPage = zeroValueFromThisPage.filter(order => 
          order.SellerComment && 
          order.SellerComment.toLowerCase().includes(searchTerm)
        );
      }
      
      // Add extracted comment field for orders containing "El zu"
zeroValueFromThisPage = zeroValueFromThisPage.map(order => {
  if (order.SellerComment && order.SellerComment.toLowerCase().includes('el zu')) {
    // Find "El zu" in the comment (case insensitive)
    const comment = order.SellerComment;
    const lowerComment = comment.toLowerCase();
    const elZuIndex = lowerComment.indexOf('el zu');
    
    if (elZuIndex !== -1) {
      // Extract everything after "El zu" (including the original case)
      const afterElZu = comment.substring(elZuIndex + 5); // 5 = length of "El zu"
      
      // Remove all spaces from the extracted part
      let extractedField = afterElZu.replace(/\s/g, '');
      
      // Add "D" if it doesn't already start with "D" followed by numbers
      if (extractedField && !extractedField.match(/^D\d/)) {
        // Check if it starts with numbers (to avoid adding D to non-numeric strings)
        if (extractedField.match(/^\d/)) {
          extractedField = 'D' + extractedField;
        }
      }
      
      // Add the new field to the order
      return {
        ...order,
        OriginalOrderID: extractedField
      };
    }
  }
  
  return order;
});
      
      allZeroValueOrders = allZeroValueOrders.concat(zeroValueFromThisPage);
      currentPage++;
      
      // Log progress for long searches
      if (currentPage % 10 === 0) {
        console.log(`Processed ${currentPage - 1}/${totalPages} pages, found ${allZeroValueOrders.length} matching orders so far`);
      }
    }
    
    res.json({
      success: true,
      description: req.query.sellerComment 
        ? `Zero-value orders with seller comment containing: "${req.query.sellerComment}"`
        : "All orders with total value of 0 EUR",
      totalMatchingOrders: allZeroValueOrders.length,
      orders: allZeroValueOrders,
      searchedPages: totalPages,
      note: 'Orders with "El zu" in SellerComment have an additional "extractedComment" field',
      appliedFilters: {
        zeroValue: true,
        sellerComment: req.query.sellerComment || null
      }
    });
    
  } catch (error) {
    console.error('Error fetching filtered orders:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch filtered orders',
      details: error.message 
    });
  }
});

// Get order by OrderNumber - supports Amazon-style and 5-figure IDs
app.get('/orders/by-id/:id', async (req, res) => {
  try {
    const searchId = req.params.id;
    let foundOrder = null;
    let currentPage = 1;
    let totalPages = 1;
    
    // Search through pages until we find the order
    while (currentPage <= totalPages && !foundOrder) {
      const params = {
        page: currentPage,
        pageSize: 250,
      };
      
      const response = await billbeeAPI.get('/orders', { params });
      totalPages = response.data.Paging.TotalPages;
      
      // Search for order by OrderNumber field only
      foundOrder = response.data.Data.find(order => 
        order.OrderNumber === searchId
      );
      
      currentPage++;
      
      // Stop searching if we've gone through too many pages without finding it
      if (currentPage > 100 && !foundOrder) {
        break;
      }
    }
    
    if (foundOrder) {
      res.json({
        success: true,
        order: foundOrder,
        searchedFor: searchId,
        foundBy: "OrderNumber",
        searchedPages: currentPage - 1
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Order not found",
        searchedFor: searchId,
        searchedPages: currentPage - 1,
        hint: "Use OrderNumber (e.g., '303-9616279-3705151' or 5-figure format)"
      });
    }
    
  } catch (error) {
    console.error('Error fetching order by OrderNumber:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch order',
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