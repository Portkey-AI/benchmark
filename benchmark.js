import OpenAI from 'openai';
import fs from 'fs';

class PortkeyBenchmark {
  constructor(config) {
    this.config = config;
    this.results = {
      openai: [],
      portkey: []
    };
    
    // Initialize OpenAI client for direct calls
    this.openaiClient = new OpenAI({
      apiKey: config.openaiApiKey
    });
    
    // Initialize Portkey client
    this.portkeyClient = new OpenAI({
      apiKey: "dummy",
      baseURL: config.portkeyBaseURL || 'https://api.portkey.ai/v1',
      defaultHeaders: {
        'x-portkey-api-key': config.portkeyApiKey || undefined,
        ...(config.portkeyProviderSlug && { 'x-portkey-provider': config.portkeyProviderSlug })
      }
    });
  }

  async makeRequest(client, prompt, provider) {
    const startTime = Date.now();
    
    try {
      // Handle both string prompts and message objects
      let messages;
      if (typeof prompt === 'string') {
        messages = [{ role: 'user', content: prompt }];
      } else if (Array.isArray(prompt)) {
        messages = prompt;
      } else {
        throw new Error('Prompt must be either a string or an array of message objects');
      }
      
      const responseWithRaw = await client.chat.completions.create({
        model: this.config.model || 'gpt-3.5-turbo',
        messages,
        max_tokens: this.config.maxTokens || 100,
        temperature: this.config.temperature || 0.7
      }, {
        // Include raw response to get headers
        stream: false,
        __binaryResponse: false
      }).withResponse();

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // The withResponse() method returns an object with 'data' and 'response' properties
      const responseData = responseWithRaw.data;
      const rawResponse = responseWithRaw.response;
      
      // Extract OpenAI processing time from headers if available
      const openaiProcessingTime = this.extractOpenAIProcessingTime(rawResponse);
      
      const result = {
        provider,
        totalTime,
        openaiProcessingTime,
        networkLatency: openaiProcessingTime ? totalTime - openaiProcessingTime : null,
        timestamp: new Date().toISOString(),
        success: true,
        tokensUsed: responseData.usage?.total_tokens || 0,
        promptTokens: responseData.usage?.prompt_tokens || 0,
        completionTokens: responseData.usage?.completion_tokens || 0
      };

      return result;
    } catch (error) {
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      return {
        provider,
        totalTime,
        openaiProcessingTime: null,
        networkLatency: null,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        tokensUsed: 0,
        promptTokens: 0,
        completionTokens: 0
      };
    }
  }

  extractOpenAIProcessingTime(response) {
    // The response passed in is the raw HTTP response object
    // OpenAI returns processing time in various header formats
    const headers = response?.headers;
    
    if (!headers) {
      console.log('No headers found in response');
      return null;
    }
    
    console.log('Headers type:', headers.constructor.name);
    
    // Common header names for processing time (in order of preference)
    const processingTimeHeaders = [
      'openai-processing-ms',
      'x-openai-processing-ms',
      'openai-processing-time-ms',
      'x-processing-time-ms',
      'processing-time-ms',
      'x-request-time-ms',
      'x-processing-time',
      'x-request-time',
      'request-time',
      'processing-time'
    ];
    
    // Try each header name
    for (const header of processingTimeHeaders) {
      const value = headers.get ? headers.get(header) : headers[header];
      if (value !== undefined && value !== null) {
        console.log(`Found header ${header}: ${value}`);
        const timeMs = parseFloat(value);
        if (!isNaN(timeMs) && timeMs > 0) {
          return timeMs;
        }
      }
    }
    
    // Try case-insensitive search as backup
    if (headers.entries) {
      for (const [key, value] of headers.entries()) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('processing') && (lowerKey.includes('ms') || lowerKey.includes('time'))) {
          console.log(`Found potential processing time header ${key}: ${value}`);
          const timeMs = parseFloat(value);
          if (!isNaN(timeMs) && timeMs > 0) {
            return timeMs;
          }
        }
      }
    }
    
    // Log all available headers for debugging
    console.log('All available headers:');
    if (headers.entries) {
      for (const [key, value] of headers.entries()) {
        console.log(`  ${key}: ${value}`);
      }
    } else {
      console.log(Object.keys(headers || {}));
    }
    
    return null;
  }

  async runPreflightTest() {
    console.log('🧪 Running preflight test...');
    
    const testPrompt = typeof this.config.prompt === 'string' 
      ? this.config.prompt.substring(0, 100) + (this.config.prompt.length > 100 ? '...' : '')
      : this.config.prompt;
    
    const testResults = {
      openai: null,
      portkey: null
    };
    
    // Test OpenAI
    console.log('📡 Testing OpenAI connection...');
    try {
      const openaiResult = await this.makeRequest(this.openaiClient, testPrompt, 'openai');
      if (openaiResult.success) {
        console.log(`✅ OpenAI test successful (${openaiResult.totalTime}ms)`);
        
        // Check if we can extract OpenAI processing time
        if (openaiResult.openaiProcessingTime !== null) {
          console.log(`✅ OpenAI processing time extracted: ${openaiResult.openaiProcessingTime}ms`);
        } else {
          console.log(`⚠️  OpenAI processing time not available in response headers`);
          console.log(`   Network latency calculation will be limited`);
        }
        
        testResults.openai = openaiResult;
      } else {
        console.log(`❌ OpenAI test failed: ${openaiResult.error}`);
        testResults.openai = openaiResult;
      }
    } catch (error) {
      console.log(`❌ OpenAI test failed with exception:`);
      console.log(`Error: ${error.message}`);
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      console.log(`Stack: ${error.stack}`);
      testResults.openai = { success: false, error: error.message, fullError: error };
    }
    
    // Test Portkey
    console.log('📡 Testing Portkey connection...');
    try {
      const portkeyResult = await this.makeRequest(this.portkeyClient, testPrompt, 'portkey');
      if (portkeyResult.success) {
        console.log(`✅ Portkey test successful (${portkeyResult.totalTime}ms)`);
        
        // Check if we can extract OpenAI processing time from Portkey response
        if (portkeyResult.openaiProcessingTime !== null) {
          console.log(`✅ OpenAI processing time extracted via Portkey: ${portkeyResult.openaiProcessingTime}ms`);
        } else {
          console.log(`⚠️  OpenAI processing time not available in Portkey response headers`);
          console.log(`   Network latency calculation will be limited`);
        }
        
        testResults.portkey = portkeyResult;
      } else {
        console.log(`❌ Portkey test failed: ${portkeyResult.error}`);
        testResults.portkey = portkeyResult;
      }
    } catch (error) {
      console.log(`❌ Portkey test failed with exception:`);
      console.log(`Error: ${error.message}`);
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
        console.log(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      console.log(`Stack: ${error.stack}`);
      testResults.portkey = { success: false, error: error.message, fullError: error };
    }
    
    // Evaluate results
    const openaiSuccess = testResults.openai && testResults.openai.success;
    const portkeySuccess = testResults.portkey && testResults.portkey.success;
    
    if (!openaiSuccess && !portkeySuccess) {
      throw new Error('Both OpenAI and Portkey preflight tests failed. Please check your configuration and API keys.');
    }
    
    if (!openaiSuccess) {
      throw new Error('⚠️  OpenAI test failed, but Portkey test passed. Aborting test...');
    }
    
    if (!portkeySuccess) {
      throw new Error('⚠️  Portkey test failed, but OpenAI test passed. Aborting test...');
    }
    
    // Check if processing times are available for both enabled providers
    const openaiHasProcessingTime = openaiSuccess && testResults.openai.openaiProcessingTime !== null;
    const portkeyHasProcessingTime = portkeySuccess && testResults.portkey.openaiProcessingTime !== null;
    
    if (openaiSuccess && portkeySuccess) {
      // Both providers are enabled, both must have processing times
      if (!openaiHasProcessingTime || !portkeyHasProcessingTime) {
        const missingProviders = [];
        if (!openaiHasProcessingTime) missingProviders.push('OpenAI');
        if (!portkeyHasProcessingTime) missingProviders.push('Portkey');
        
        throw new Error(`Processing time extraction failed for ${missingProviders.join(' and ')}. ` +
          'Both providers must return processing time headers for accurate latency comparison. ' +
          'Please check if the APIs are returning the expected headers.');
      }
    } else if (openaiSuccess && !openaiHasProcessingTime) {
      throw new Error('OpenAI processing time extraction failed. Cannot proceed with accurate latency measurement.');
    } else if (portkeySuccess && !portkeyHasProcessingTime) {
      throw new Error('Portkey processing time extraction failed. Cannot proceed with accurate latency measurement.');
    }
    
    console.log('✅ Preflight test completed successfully!\n');
    
    return {
      openaiEnabled: openaiSuccess,
      portkeyEnabled: portkeySuccess,
      testResults
    };
  }

  async runBenchmark() {
    console.log('🚀 Starting Portkey Latency Benchmark');
    console.log(`Configuration:
    - Model: ${this.config.model || 'gpt-3.5-turbo'}
    - Concurrency: ${this.config.concurrency}
    - Max Requests: ${this.config.maxRequests}
    - Test Duration: ${this.config.testDuration}s
    - Prompt: ${typeof this.config.prompt === 'string' ? `"${this.config.prompt.substring(0, 50)}..."` : `${this.config.prompt.length} message(s)`}
    `);

    // Run preflight test first
    const preflightResults = await this.runPreflightTest();
    
    // Store which providers are enabled
    this.openaiEnabled = preflightResults.openaiEnabled;
    this.portkeyEnabled = preflightResults.portkeyEnabled;

    const promises = [];
    const startTime = Date.now();
    
    // Shared state for coordinating between workers
    this.sharedState = {
      requestCount: 0,
      shouldStop: false,
      maxRequestsReached: false,
      timeLimit: false
    };
    
    console.log('⏳ Starting concurrent request workers...');
    
    // Create a pool of concurrent requests
    for (let i = 0; i < this.config.concurrency; i++) {
      promises.push(this.runConcurrentRequests(startTime, i));
    }
    
    await Promise.all(promises);
    
    // Show completion summary
    const finalTime = (Date.now() - startTime) / 1000;
    const totalRequests = Math.max(this.results.openai.length, this.results.portkey.length);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Benchmark completed!');
    console.log(`📊 Final Stats:`);
    console.log(`   • Total requests started: ${this.sharedState.requestCount}`);
    console.log(`   • Total requests completed: ${totalRequests}`);
    console.log(`   • Duration: ${finalTime.toFixed(2)}s`);
    console.log(`   • Average rate: ${(totalRequests / finalTime).toFixed(2)} requests/sec`);
    
    if (this.sharedState.maxRequestsReached) {
      console.log(`🎯 Stopped: Max requests limit reached (${this.config.maxRequests})`);
    } else if (this.sharedState.timeLimit) {
      console.log(`⏰ Stopped: Time limit reached (${this.config.testDuration}s)`);
    } else {
      console.log(`🏁 Stopped: All workers completed naturally`);
    }
    console.log('='.repeat(50));
    
    this.generateReport();
  }

  async runConcurrentRequests(startTime, workerId) {
    console.log(`🔄 Worker ${workerId + 1} started`);
    
    while (true) {
      // Check shared stopping conditions first
      if (this.sharedState.shouldStop) {
        console.log(`🛑 Worker ${workerId + 1} stopping: Stop signal received`);
        break;
      }
      
      const currentTime = Date.now();
      const elapsedTime = (currentTime - startTime) / 1000;
      
      // Check if we've exceeded time limit
      if (this.config.testDuration && elapsedTime >= this.config.testDuration) {
        console.log(`⏰ Worker ${workerId + 1} stopping: Time limit reached`);
        this.sharedState.shouldStop = true;
        this.sharedState.timeLimit = true;
        break;
      }
      
      // Atomic check and increment for max requests
      if (this.config.maxRequests && this.sharedState.requestCount >= this.config.maxRequests) {
        console.log(`🎯 Worker ${workerId + 1} stopping: Max requests reached`);
        this.sharedState.shouldStop = true;
        this.sharedState.maxRequestsReached = true;
        break;
      }
      
      // Increment request count atomically
      this.sharedState.requestCount++;
      const currentRequestNumber = this.sharedState.requestCount;
      
      // Double-check if we exceeded max requests after incrementing (race condition protection)
      if (this.config.maxRequests && currentRequestNumber > this.config.maxRequests) {
        console.log(`🎯 Worker ${workerId + 1} stopping: Exceeded max requests (${currentRequestNumber}/${this.config.maxRequests})`);
        this.sharedState.shouldStop = true;
        this.sharedState.maxRequestsReached = true;
        break;
      }
      
      console.log(`📡 Worker ${workerId + 1} - Request ${currentRequestNumber} starting...`);
      
      // Make requests to enabled providers only
      const requestStartTime = Date.now();
      const requests = [];
      
      if (this.openaiEnabled) {
        requests.push(this.makeRequest(this.openaiClient, this.config.prompt, 'openai'));
      }
      
      if (this.portkeyEnabled) {
        requests.push(this.makeRequest(this.portkeyClient, this.config.prompt, 'portkey'));
      }
      
      const results = await Promise.all(requests);
      
      // Assign results to appropriate arrays
      let openaiResult = null;
      let portkeyResult = null;
      
      if (this.openaiEnabled && this.portkeyEnabled) {
        [openaiResult, portkeyResult] = results;
      } else if (this.openaiEnabled) {
        [openaiResult] = results;
      } else if (this.portkeyEnabled) {
        [portkeyResult] = results;
      }
      
      const requestEndTime = Date.now();
      const requestDuration = requestEndTime - requestStartTime;
      
      // Log results
      let logMessage = `📊 Worker ${workerId + 1} - Request ${currentRequestNumber} completed in ${requestDuration}ms`;
      
      if (openaiResult) {
        const openaiStatus = openaiResult.success ? '✅' : '❌';
        logMessage += ` | OpenAI: ${openaiStatus} ${openaiResult.totalTime}ms`;
        this.results.openai.push(openaiResult);
      }
      
      if (portkeyResult) {
        const portkeyStatus = portkeyResult.success ? '✅' : '❌';
        logMessage += ` | Portkey: ${portkeyStatus} ${portkeyResult.totalTime}ms`;
        this.results.portkey.push(portkeyResult);
      }
      
      console.log(logMessage);
      
      // Progress summary every 10 requests (only from worker 1 to avoid spam)
      if (currentRequestNumber % 10 === 0 && workerId === 0) {
        const totalRequests = Math.max(this.results.openai.length, this.results.portkey.length);
        let progressMessage = `📈 Progress: ${this.sharedState.requestCount} requests started, ${totalRequests} completed`;
        
        if (this.config.maxRequests) {
          progressMessage += ` (${Math.min(this.sharedState.requestCount, this.config.maxRequests)}/${this.config.maxRequests})`;
        }
        
        if (this.openaiEnabled) {
          const successfulOpenAI = this.results.openai.filter(r => r.success).length;
          progressMessage += ` | OpenAI: ${successfulOpenAI}/${this.results.openai.length} success`;
        }
        
        if (this.portkeyEnabled) {
          const successfulPortkey = this.results.portkey.filter(r => r.success).length;
          progressMessage += ` | Portkey: ${successfulPortkey}/${this.results.portkey.length} success`;
        }
        
        console.log(progressMessage);
      }
      
      // Add small delay to prevent overwhelming the APIs
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🏁 Worker ${workerId + 1} finished`);
  }

  calculateStats(results) {
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    if (successfulResults.length === 0) {
      return {
        count: 0,
        successRate: 0,
        failureRate: 100,
        avgTotalTime: 0,
        avgOpenAITime: 0,
        avgNetworkLatency: 0,
        medianTotalTime: 0,
        p95TotalTime: 0,
        p99TotalTime: 0,
        minTotalTime: 0,
        maxTotalTime: 0,
        totalTokens: 0,
        avgTokensPerRequest: 0
      };
    }
    
    const totalTimes = successfulResults.map(r => r.totalTime).sort((a, b) => a - b);
    const openaiTimes = successfulResults.map(r => r.openaiProcessingTime).filter(t => t !== null);
    const networkLatencies = successfulResults.map(r => r.networkLatency).filter(l => l !== null);
    
    const totalTokens = successfulResults.reduce((sum, r) => sum + r.tokensUsed, 0);
    
    // Helper function for proper percentile calculation with interpolation
    const calculatePercentile = (sortedArray, percentile) => {
      if (sortedArray.length === 0) return 0;
      if (sortedArray.length === 1) return sortedArray[0];
      
      const index = (percentile / 100) * (sortedArray.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      
      if (lower === upper) {
        return sortedArray[lower];
      }
      
      // Linear interpolation
      const weight = index - lower;
      return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
    };
    
    return {
      count: results.length,
      successfulCount: successfulResults.length,
      failedCount: failedResults.length,
      successRate: (successfulResults.length / results.length) * 100,
      failureRate: (failedResults.length / results.length) * 100,
      avgTotalTime: totalTimes.reduce((sum, t) => sum + t, 0) / totalTimes.length,
      avgOpenAITime: openaiTimes.length > 0 ? openaiTimes.reduce((sum, t) => sum + t, 0) / openaiTimes.length : 0,
      avgNetworkLatency: networkLatencies.length > 0 ? networkLatencies.reduce((sum, l) => sum + l, 0) / networkLatencies.length : 0,
      medianTotalTime: calculatePercentile(totalTimes, 50),
      p95TotalTime: calculatePercentile(totalTimes, 95),
      p99TotalTime: calculatePercentile(totalTimes, 99),
      minTotalTime: totalTimes[0] || 0,
      maxTotalTime: totalTimes[totalTimes.length - 1] || 0,
      totalTokens,
      avgTokensPerRequest: totalTokens / successfulResults.length
    };
  }

  generateReport() {
    const openaiStats = this.calculateStats(this.results.openai);
    const portkeyStats = this.calculateStats(this.results.portkey);
    
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      summary: {
        totalRequests: Math.max(this.results.openai.length, this.results.portkey.length),
        openaiStats,
        portkeyStats,
        comparison: {
          latencyOverhead: portkeyStats.avgTotalTime - openaiStats.avgTotalTime,
          latencyOverheadPercentage: ((portkeyStats.avgTotalTime - openaiStats.avgTotalTime) / openaiStats.avgTotalTime) * 100,
          networkLatencyDiff: portkeyStats.avgNetworkLatency - openaiStats.avgNetworkLatency,
          successRateDiff: portkeyStats.successRate - openaiStats.successRate
        }
      },
      rawResults: {
        openai: this.results.openai,
        portkey: this.results.portkey
      }
    };
    
    this.printReport(report);
    this.saveReport(report);
  }

  printReport(report) {
    const { openaiStats, portkeyStats, comparison } = report.summary;
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 PORTKEY LATENCY BENCHMARK REPORT');
    console.log('='.repeat(60));
    
    console.log('\n🔍 TEST SUMMARY:');
    console.log(`Total Request Pairs: ${report.summary.totalRequests}`);
    console.log(`Test Duration: ${new Date(report.timestamp).toLocaleString()}`);
    
    console.log('\n📈 PERFORMANCE COMPARISON:');
    console.log('┌─────────────────────┬──────────────┬──────────────┬─────────────┐');
    console.log('│ Metric              │ OpenAI       │ Portkey      │ Difference  │');
    console.log('├─────────────────────┼──────────────┼──────────────┼─────────────┤');
    console.log(`│ Avg Total Time      │ ${openaiStats.avgTotalTime.toFixed(2)}ms      │ ${portkeyStats.avgTotalTime.toFixed(2)}ms      │ +${comparison.latencyOverhead.toFixed(2)}ms     │`);
    console.log(`│ Avg Network Latency │ ${openaiStats.avgNetworkLatency.toFixed(2)}ms      │ ${portkeyStats.avgNetworkLatency.toFixed(2)}ms      │ +${comparison.networkLatencyDiff.toFixed(2)}ms     │`);
    console.log(`│ Success Rate        │ ${openaiStats.successRate.toFixed(1)}%       │ ${portkeyStats.successRate.toFixed(1)}%       │ ${comparison.successRateDiff.toFixed(1)}%       │`);
    console.log(`│ Median Time         │ ${openaiStats.medianTotalTime.toFixed(2)}ms      │ ${portkeyStats.medianTotalTime.toFixed(2)}ms      │ +${(portkeyStats.medianTotalTime - openaiStats.medianTotalTime).toFixed(2)}ms     │`);
    console.log(`│ P95 Time            │ ${openaiStats.p95TotalTime.toFixed(2)}ms      │ ${portkeyStats.p95TotalTime.toFixed(2)}ms      │ +${(portkeyStats.p95TotalTime - openaiStats.p95TotalTime).toFixed(2)}ms     │`);
    console.log(`│ P99 Time            │ ${openaiStats.p99TotalTime.toFixed(2)}ms      │ ${portkeyStats.p99TotalTime.toFixed(2)}ms      │ +${(portkeyStats.p99TotalTime - openaiStats.p99TotalTime).toFixed(2)}ms     │`);
    console.log('└─────────────────────┴──────────────┴──────────────┴─────────────┘');
    
    console.log('\n🎯 KEY INSIGHTS:');
    console.log(`• Portkey adds an average of ${comparison.latencyOverhead.toFixed(2)}ms latency (${comparison.latencyOverheadPercentage.toFixed(1)}% increase)`);
    console.log(`• Network latency difference: ${comparison.networkLatencyDiff.toFixed(2)}ms`);
    console.log(`• Success rate difference: ${comparison.successRateDiff.toFixed(1)}%`);
    
    if (comparison.latencyOverhead > 0) {
      console.log(`• Portkey proxy overhead: ${comparison.latencyOverhead.toFixed(2)}ms per request`);
    }
    
    console.log('\n💾 Detailed results saved to: benchmark_results.json');
  }

  saveReport(report) {
    const filename = `benchmark_results_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(`./results/${filename}`, JSON.stringify(report, null, 2));
    console.log(`📄 Report saved to: ${filename}`);
  }
}

// Load configuration and run benchmark
async function main() {
  try {
    // Load config from file
    const configPath = process.argv[2] || 'config.json';
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Validate required fields
    if (!config.portkeyApiKey && !config.openaiApiKey) {
      throw new Error('At least one API key (portkeyApiKey or openaiApiKey) must be provided in config');
    }
    
    if (!config.prompt) {
      throw new Error('Missing prompt in config');
    }
    
    // Set defaults
    config.concurrency = config.concurrency || 5;
    config.maxRequests = config.maxRequests || 100;
    config.testDuration = config.testDuration || 60;
    
    const benchmark = new PortkeyBenchmark(config);
    await benchmark.runBenchmark();
    
  } catch (error) {
    console.error('❌ Error running benchmark:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default PortkeyBenchmark;