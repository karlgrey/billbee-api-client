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
      const extractedField = afterElZu.replace(/\s/g, '');
      
      // Add the new field to the order (no "D" prefix logic)
      return {
        ...order,
        OriginalInvoiceID: extractedField
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


// Get multiple orders by InvoiceNumbers - query parameter method
app.get('/orders/by-invoice-ids', async (req, res) => {
  try {
    const invoiceIds = req.query.ids ? req.query.ids.split(',') : [];
    
    console.log('=== DEBUG: Invoice ID Search ===');
    console.log('Raw query.ids:', req.query.ids);
    console.log('Parsed invoiceIds:', invoiceIds);
    
    if (invoiceIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No invoice IDs provided",
        usage: "?ids=30002,30022,12345"
      });
    }
    
    let foundOrders = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalOrdersSearched = 0;
    
    // Search through all pages
    while (currentPage <= totalPages) {
      const params = {
        page: currentPage,
        pageSize: 250,
      };
      
      const response = await billbeeAPI.get('/orders', { params });
      totalPages = response.data.Paging.TotalPages;
      const ordersOnThisPage = response.data.Data || [];
      totalOrdersSearched += ordersOnThisPage.length;
      
      console.log(`Page ${currentPage}: Found ${ordersOnThisPage.length} orders`);
      
      // Debug: Show some sample InvoiceNumbers from this page
      if (currentPage === 1 && ordersOnThisPage.length > 0) {
        console.log('Sample InvoiceNumbers from first page:');
        ordersOnThisPage.slice(0, 5).forEach(order => {
          console.log(`  Order ID: ${order.Id}, InvoiceNumber: "${order.InvoiceNumber}" (type: ${typeof order.InvoiceNumber})`);
        });
      }
      
      // Find orders matching any of the provided InvoiceNumbers
      const matchingOrders = ordersOnThisPage.filter(order => {
        if (!order.InvoiceNumber) return false;
        
        const orderInvoiceStr = order.InvoiceNumber.toString();
        const match = invoiceIds.includes(orderInvoiceStr);
        
        // Debug each comparison
        if (currentPage === 1) {
          console.log(`Checking order ${order.Id}: "${orderInvoiceStr}" against [${invoiceIds.join(', ')}] = ${match}`);
        }
        
        return match;
      });
      
      if (matchingOrders.length > 0) {
        console.log(`Found ${matchingOrders.length} matching orders on page ${currentPage}`);
      }
      
      foundOrders = foundOrders.concat(matchingOrders);
      currentPage++;
      
      // Stop if we found all requested orders
      if (foundOrders.length === invoiceIds.length) {
        console.log('Found all requested orders, stopping search');
        break;
      }
      
      // Progress logging for large searches
      if (currentPage % 20 === 0) {
        console.log(`Searched ${currentPage - 1}/${totalPages} pages, found ${foundOrders.length}/${invoiceIds.length} orders`);
      }
    }
    
    console.log(`=== SEARCH COMPLETE ===`);
    console.log(`Total orders searched: ${totalOrdersSearched}`);
    console.log(`Total pages searched: ${currentPage - 1}`);
    console.log(`Found orders: ${foundOrders.length}`);
    
    res.json({
      success: true,
      requestedInvoiceIds: invoiceIds,
      foundOrders: foundOrders.length,
      totalRequested: invoiceIds.length,
      orders: foundOrders,
      notFound: invoiceIds.filter(id => 
        !foundOrders.some(order => order.InvoiceNumber && order.InvoiceNumber.toString() === id)
      ),
      searchedPages: currentPage - 1,
      totalOrdersSearched: totalOrdersSearched,
      debug: {
        rawQuery: req.query.ids,
        parsedIds: invoiceIds
      }
    });
    
  } catch (error) {
    console.error('Error fetching orders by InvoiceNumbers:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch orders by invoice IDs',
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