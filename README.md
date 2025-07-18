# Portkey Latency Benchmark

A comprehensive benchmarking tool to measure and compare latency between direct OpenAI API calls and Portkey proxy calls. This tool helps you understand the performance overhead introduced by using Portkey as a proxy layer.

## 🎯 Purpose

This benchmark tool:
- Compares response times between OpenAI direct API and Portkey proxy
- Measures network latency overhead introduced by Portkey
- Tests performance under concurrent load
- Provides detailed statistical analysis and reports
- Identifies OpenAI processing time vs. network latency breakdown

## 📋 Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager
- Valid OpenAI API key
- Valid Portkey API key

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your API keys:**
   Edit `config.json` and replace the placeholder values:
   ```json
   {
     "portkeyApiKey": "pk-your-actual-portkey-api-key",
     "openaiApiKey": "sk-your-actual-openai-api-key"
   }
   ```

3. **Run the benchmark:**
   ```bash
   npm start
   ```
   or
   ```bash
   node benchmark.js
   ```

## ⚙️ Configuration

The `config.json` file contains all benchmarking parameters:

### Required Settings
- `openaiApiKey`: Your OpenAI API key
- `portkeyApiKey`: Your Portkey API key

### API Configuration
- `portkeyBaseURL`: Portkey API endpoint (default: "https://api.portkey.ai/v1")
- `portkeyConfigId`: Optional Portkey configuration ID
- `model`: OpenAI model to test (default: "gpt-3.5-turbo")

### Test Parameters
- `concurrency`: Number of concurrent requests (default: 5)
- `maxRequests`: Maximum number of requests to send (default: 100)
- `testDuration`: Maximum test duration in seconds (default: 60)
- `maxTokens`: Maximum tokens per response (default: 150)
- `temperature`: Model temperature setting (default: 0.7)

> **⚠️ Important for Accurate Results:** We strongly recommend running at least **500 requests** to get statistically meaningful results and avoid skewed measurements. Small sample sizes can lead to unreliable latency comparisons due to network variability and cold start effects.

### Prompt Configuration
The `prompt` can be either:
- **String format:** `"Your prompt text here"`
- **Message array format:** 
  ```json
  [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Your question here"}
  ]
  ```

### Example Configuration
```json
{
  "portkeyBaseURL": "https://api.portkey.ai/v1",
  "portkeyApiKey": "pk-your-key-here",
  "openaiApiKey": "sk-your-key-here",
  "model": "gpt-3.5-turbo",
  "prompt": "Explain quantum computing in simple terms.",
  "concurrency": 30,
  "maxRequests": 500,
  "testDuration": 60,
  "maxTokens": 100,
  "temperature": 0.7
}
```

## 🏃‍♂️ Usage

### Basic Usage
```bash
node benchmark.js
```

### Custom Configuration File
```bash
node benchmark.js custom-config.json
```

## 📊 Understanding the Output

### Console Output
The benchmark provides real-time progress updates:
- Preflight test results
- Worker progress with request timings
- Success/failure rates for each provider
- Periodic progress summaries

### Final Report
```
📊 PORTKEY LATENCY BENCHMARK REPORT
==================================================

🔍 TEST SUMMARY:
Total Request Pairs: 500
Test Duration: 2023-12-01T10:30:00.000Z

📈 PERFORMANCE COMPARISON:
┌─────────────────────┬──────────────┬──────────────┬─────────────┐
│ Metric              │ OpenAI       │ Portkey      │ Difference  │
├─────────────────────┼──────────────┼──────────────┼─────────────┤
│ Avg Total Time      │ 1247.20ms    │ 1267.30ms    │ +20.10ms    │
│ Avg Network Latency │ 182.50ms     │ 202.40ms     │ +19.90ms    │
│ Success Rate        │ 99.8%        │ 99.6%        │ -0.2%       │
│ Median Time         │ 1198.00ms    │ 1219.00ms    │ +21.00ms    │
│ P95 Time            │ 1785.00ms    │ 1809.00ms    │ +24.00ms    │
│ P99 Time            │ 2087.00ms    │ 2115.00ms    │ +28.00ms    │
└─────────────────────┴──────────────┴──────────────┴─────────────┘

🎯 KEY INSIGHTS:
• Portkey adds an average of 20.10ms latency (1.6% increase)
• Network latency difference: 19.90ms
• Success rate difference: -0.2%
```

### Saved Reports
Detailed JSON reports are saved to the `results/` directory with:
- Complete configuration used
- Raw timing data for all requests
- Statistical summaries
- Success/failure details

## 📈 Metrics Explained

- **Total Time**: End-to-end request time including network and processing
- **OpenAI Processing Time**: Time spent by OpenAI servers processing the request
- **Network Latency**: Time spent in network transmission (Total - Processing)
- **Success Rate**: Percentage of requests that completed successfully
- **P95/P99**: 95th and 99th percentile response times (worst-case scenarios)

## 🛠️ Troubleshooting

### Common Issues

**"Both OpenAI and Portkey preflight tests failed"**
- Check your API keys are valid and properly formatted
- Verify network connectivity
- Ensure API quotas are not exceeded

**"Processing time extraction failed"**
- Some OpenAI responses may not include processing time headers
- The benchmark will continue but network latency calculations will be limited

**"Config file not found"**
- Ensure `config.json` exists in the same directory
- Use the correct path if specifying a custom config file

**High failure rates**
- Check API rate limits and quotas
- Reduce concurrency if hitting rate limits
- Verify the model specified is available

### Debug Mode
For detailed header information and debugging:
- Check console output during preflight testing
- Review the raw results in the generated JSON reports
- Headers and processing times are logged during preflight tests

## 📁 Project Structure

```
benchmark/
├── benchmark.js          # Main benchmark script
├── config.json          # Configuration file
├── package.json         # Node.js dependencies
├── package-lock.json    # Dependency lock file
├── results/             # Generated benchmark reports
└── README.md           # This file
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with different configurations
5. Submit a pull request

## 📄 License

MIT License - see package.json for details.

## ⚠️ Important Notes

- **API Costs**: This tool makes real API calls that will consume your OpenAI/Portkey credits
- **Rate Limits**: Be mindful of API rate limits when setting high concurrency
- **Fair Testing**: Use identical prompts and settings for accurate comparisons
- **Processing Time**: Accuracy depends on API providers returning processing time headers 