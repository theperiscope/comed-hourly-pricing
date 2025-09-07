@rem Stop and remove any existing container named comed-hourly-pricing (ignore errors)
@docker rm -f comed-hourly-pricing >NUL 2>&1
@rem Run the comed-hourly-pricing image exposing port 8123
@docker run -d -p 8123:8123 --name comed-hourly-pricing comed-hourly-pricing