// Cached DOM references and formatters
const DOM = {
  priceChart: null,
  cards: {
    currentHour: null,
    selectedRange: null,
    last24Hours: null
  }
};

const DATE_FMT = new Intl.DateTimeFormat([], { month: 'short', day: 'numeric' });
const TIME_FMT_24 = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', hour12: false });

function darkModeMatch() {
  return window.matchMedia('(prefers-color-scheme: dark)');
}

function isDarkMode() {
  return window.matchMedia && darkModeMatch().matches;
}

function applyDarkMode(isDark) {
  document.documentElement.classList.toggle('dark', !!isDark);
}

function getCSSVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// price colors from CSS variables (fallback to hardcoded values if missing)
const PRICE_COLORS = {
  low: () => getCSSVar('--price-color-low') || '#2f4b7c',
  medium: () => getCSSVar('--price-color-medium') || '#ff7c43',
  high: () => getCSSVar('--price-color-high') || '#d45087',
  def: () => getCSSVar('--price-color-default') || getCSSVar('--price-color-low') || '#2f4b7c'
};
const PRICE_THRESHOLD_LOW = 8;
const PRICE_THRESHOLD_HIGH = 15;

class PriceCard extends HTMLElement {
  constructor() {
    super();
    const template = document.getElementById('price-card-template').content;
    this.attachShadow({ mode: 'open' }).appendChild(template.cloneNode(true));
    this.shadowRoot.querySelector('.title').innerText = this.getAttribute('title');
  }
  setCardTitle(text) {
    this.shadowRoot.querySelector('.title').innerText = text;
  }
  getBackgroundColorForPrice(price) {
    if (price < PRICE_THRESHOLD_LOW) return PRICE_COLORS.low();
    if (price >= PRICE_THRESHOLD_LOW && price < PRICE_THRESHOLD_HIGH) return PRICE_COLORS.medium();
    if (price >= PRICE_THRESHOLD_HIGH) return PRICE_COLORS.high();
    return PRICE_COLORS.def();
  }
  setPrice(price) {
    const numericPrice = parseFloat(price);
    const priceText = isNaN(numericPrice) ? 'N/A' : `${numericPrice.toFixed(1)}¢`;
    this.shadowRoot.querySelector('.price').innerText = priceText;
    this._lastPrice = numericPrice;
    const backgroundColor = this.getBackgroundColorForPrice(numericPrice);
    // use CSS custom property so theme transitions apply via stylesheet
    if (!isNaN(numericPrice)) {
      this.style.setProperty('--price-card-background', backgroundColor);
    } else {
      this.style.removeProperty('--price-card-background');
    }
  }
  refreshThemeBackground() {
    if (typeof this._lastPrice === 'number' && isFinite(this._lastPrice)) {
      const backgroundColor = this.getBackgroundColorForPrice(this._lastPrice);
      this.style.setProperty('--price-card-background', backgroundColor);
    } else {
      this.style.removeProperty('--price-card-background');
    }
  }
}
customElements.define('price-card', PriceCard);

class PriceChart extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<div style="width: 100%; height: 100%;"></div>`;
    this.chart = echarts.init(this.shadowRoot.querySelector('div'), null, { renderer: 'svg' });
    this.isInitialLoad = true;
    this.chartType = 'bar';
    this.currentData = [];
    this.lastSelectedHours = 3; // default initial zoom hours
    this.initializeChart();
    this.chart.on('dataZoom', () => {
      this.updateSelectedAverage();
    });
    // Observe host size changes
    this._resizeObserver = new ResizeObserver(() => this.resizeChart());
    this._resizeObserver.observe(this);
  }
  disconnectedCallback() {
    this._resizeObserver?.disconnect();
  }
  _getResponsiveOptions() {
    const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const nameFontSize = 0.875 * rootFontSize;
    const labelFontSize = 0.75 * rootFontSize;

    return {
      title: {
        left: 'center',
        text: 'Comed 5-Minute Electricity Prices (¢/kWh)',
        textStyle: { fontSize: 1.4 * rootFontSize, color: getCSSVar('--chart-text-color') },
        top: 0
      },
      toolbox: {
        right: 5,
        top: 0,
        feature: {
          itemGap: 0,
          saveAsImage: {
            type: 'svg',
            name: 'comed-5-minute-prices',
            title: 'Save'
          }
        }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: getCSSVar('--chart-tooltip-background-color'),
        borderColor: getCSSVar('--chart-tooltip-border-color'),
        borderWidth: 1,
        axisPointer: {
          type: 'cross',
          lineStyle: { color: getCSSVar('--chart-tooltip-border-color') },
          crossStyle: { color: getCSSVar('--chart-tooltip-border-color') },
          label: { color: getCSSVar('--chart-text-color'), backgroundColor: getCSSVar('--chart-tooltip-background-color') }
        },
        textStyle: { fontSize: labelFontSize, color: getCSSVar('--chart-text-color') },
        formatter: function (params) {
          const param = params[0];
          const date = new Date(param.value[0]);
          const timeString = TIME_FMT_24.format(date);
          const dateString = DATE_FMT.format(date);
          const value = parseFloat(param.value[1]).toFixed(1);

          return `${dateString}, ${timeString}<br/>${param.marker}<strong>${value} ¢</strong>`;
        }
      },
      grid: {
        left: '50px',
        right: '1%',
        top: '40px',
        bottom: '130px' // increased to accommodate dataZoom
      },
      xAxis: {
        type: 'time',
        name: '',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: nameFontSize, color: getCSSVar('--chart-text-color') },
        axisLine: { lineStyle: { color: getCSSVar('--chart-grid-line-color') } },
        axisLabel: {
          fontSize: labelFontSize,
          color: getCSSVar('--chart-text-color'),
          formatter: function (value) {
            return TIME_FMT_24.format(new Date(value));
          }
        },
        // Controls the floating label that appears on the X axis when hovering (crosshair)
        axisPointer: {
          label: {
            show: true,
            formatter: function (params) {
              const date = new Date(params.value);
              return `${TIME_FMT_24.format(date)}`;
            }
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '',
        nameLocation: 'middle',
        nameGap: 0,
        nameTextStyle: { fontSize: nameFontSize, color: getCSSVar('--chart-text-color') },
        axisLine: { lineStyle: { color: getCSSVar('--chart-grid-line-color') } },
        splitLine: { show: true, lineStyle: { color: getCSSVar('--chart-grid-line-color') } },
        axisLabel: { formatter: '{value} ¢', fontSize: labelFontSize, color: getCSSVar('--chart-text-color') },
        // Controls the floating label that appears on the Y axis when hovering (crosshair)
        axisPointer: {
          label: {
            show: true,
            formatter: function (params) {
              const v = Number(params.value);
              return isFinite(v) ? `${v.toFixed(1)} ¢/kWh` : '';
            }
          }
        }
      },
      dataZoom: [
        {
          type: 'inside',
          orient: 'horizontal',
          xAxisIndex: 0
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 100,
          bottom: 0,
          handleSize: '40%',
          borderColor: '#00000000',
          dataBackground: {
            areaStyle: { color: '#00000000' }, // eCharts 6 has problems rendering the area style correctly
            lineStyle: { width: 0.5 }
          },
          selectedDataBackground: {
            areaStyle: { color: '#00000000' }, // eCharts 6 has problems rendering the area style correctly
            lineStyle: { width: 2 }
          }
        }
      ],
      visualMap: {
        type: 'piecewise',
        show: false,
        dimension: 1,
        pieces: [
          { lt: PRICE_THRESHOLD_LOW, color: PRICE_COLORS.low() },
          { gte: PRICE_THRESHOLD_LOW, lt: PRICE_THRESHOLD_HIGH, color: PRICE_COLORS.medium() },
          { gte: PRICE_THRESHOLD_HIGH, color: PRICE_COLORS.high() }
        ]
      },
      series: [this._getSeriesOption()]
    };
  }

  _getSeriesOption() {
    const seriesConfig = {
      name: 'Price',
      data: this.currentData,
      type: this.chartType
    };
    if (this.chartType === 'line') {
      seriesConfig.smooth = true;
      seriesConfig.showSymbol = false;
      seriesConfig.lineStyle = { width: 3 };
      seriesConfig.areaStyle = {};
    }
    return seriesConfig;
  }

  setChartType(type) {
    if (type === this.chartType) return;
    this.chartType = type;
    this.chart.setOption({ series: [this._getSeriesOption()] });
  }

  setZoom(hours) {
    if (!this.chart || typeof hours !== 'number' || hours <= 0 || hours > 24) return;
    const startPercent = Math.max(0, 100 - (hours / 24) * 100);
    this.chart.dispatchAction({
      type: 'dataZoom',
      start: startPercent,
      end: 100
    });
    this.lastSelectedHours = hours;
    this.updateSelectedAverage();
  }

  resizeChart() {
    if (this.chart) {
      this.chart.resize();
    }
  }

  initializeChart() {
    this.chart.setOption(this._getResponsiveOptions());
  }

  refreshTheme() {
    // use notMerge=true to replace theme-related options; lazyUpdate to avoid sync layout
    this.chart.setOption(this._getResponsiveOptions(), true);
  }

  updateData(data) {
    this.currentData = data;
    const option = { series: [this._getSeriesOption()] };
    this.chart.setOption(option);

    if (this.isInitialLoad && data.length > 0) {
      this.setZoom(3);
      this.isInitialLoad = false;
    }
    this.updateSelectedAverage();
  }

  updateSelectedAverage() {
    const card = this.selectedRangeCard || DOM?.cards?.selectedRange || document.querySelector('price-card[title="Selected Range"]');
    if (!card || !this.currentData.length) return;
    const xAxisModel = this.chart.getModel().getComponent('xAxis');
    if (!xAxisModel) return;
    const extent = xAxisModel.axis.scale.getExtent();
    const [minTime, maxTime] = extent;
    const visiblePoints = this.currentData.filter((d) => d[0] >= minTime && d[0] <= maxTime);
    if (!visiblePoints.length) return;
    const avg = visiblePoints.reduce((acc, d) => acc + d[1], 0) / visiblePoints.length;
    card.setPrice(avg);
    const startDate = new Date(minTime);
    const endDate = new Date(maxTime);
    const sameDay = startDate.toDateString() === endDate.toDateString();
    const pad = (n) => n.toString().padStart(2, '0');
    const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const fmtDay = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    let title;
    if (minTime === maxTime) {
      title = `${sameDay ? fmtDay(startDate) + ' ' : ''}${fmtTime(startDate)}`;
    } else if (sameDay) {
      title = `${fmtTime(startDate)}-${fmtTime(endDate)}`;
    } else {
      title = `${fmtDay(startDate)} ${fmtTime(startDate)}–${fmtDay(endDate)} ${fmtTime(endDate)}`;
    }
    card.setCardTitle(title);
  }
}
customElements.define('price-chart', PriceChart);

async function fetchData(apiUrl) {
  const response = await fetch(apiUrl);
  if (!response.ok) throw new Error(`Failed to fetch data: ${response.statusText}`);
  return await response.json();
}

async function updateDisplay() {
  try {
    const [fiveMinuteFeed, currentHourAverage] = await Promise.all([fetchData('/5minutefeed'), fetchData('/currenthouraverage')]);
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const last24hData = fiveMinuteFeed.filter((d) => parseInt(d.millisUTC) > twentyFourHoursAgo);
    const calculateAverage = (data) => {
      if (!data || data.length === 0) return NaN;
      return data.reduce((acc, curr) => acc + parseFloat(curr.price), 0) / data.length;
    };
    const currentHourPrice =
      Array.isArray(currentHourAverage) && currentHourAverage[0] && currentHourAverage[0].price != null
        ? currentHourAverage[0].price
        : last24hData.length
        ? last24hData[last24hData.length - 1].price
        : NaN;
    DOM.cards.currentHour?.setPrice(currentHourPrice);
    DOM.cards.last24Hours?.setPrice(calculateAverage(last24hData));
    const chartData = last24hData.map((d) => [parseInt(d.millisUTC), parseFloat(d.price)]);
    const chart = DOM.priceChart || document.querySelector('price-chart');
    chart.updateData(chartData);
    requestAnimationFrame(() => chart.resizeChart());
  } catch (error) {
    console.error('Error updating data:', error);
  }
}

function init() {
  const priceChart = document.querySelector('price-chart');
  DOM.priceChart = priceChart;
  DOM.cards.currentHour = document.querySelector('price-card[title="Current Hour"]');
  DOM.cards.selectedRange = document.querySelector('price-card[title="Selected Range"]');
  DOM.cards.last24Hours = document.querySelector('price-card[title="Last 24 Hours"]');
  priceChart.selectedRangeCard = DOM.cards.selectedRange;
  const zoomControls = document.querySelector('.zoom-controls');
  const typeControls = document.querySelector('.type-controls');

  applyDarkMode(isDarkMode());
  const media = darkModeMatch();
  const refreshThemeUI = () => {
    // re-apply chart options so it picks up new CSS variables, then resize
    priceChart?.refreshTheme();
    priceChart?.resizeChart();
    // refresh price-card backgrounds based on stored values
    DOM.cards.currentHour?.refreshThemeBackground?.();
    DOM.cards.selectedRange?.refreshThemeBackground?.();
    DOM.cards.last24Hours?.refreshThemeBackground?.();
    // re-apply zoom to fix any potential layout issues after theme change
    const button = document.querySelector('.zoom-controls button.active') || zoomControls.querySelector('button[data-hours="3"]');
    if (button && button.dataset.hours) {
      const hours = parseInt(button.dataset.hours, 10);
      priceChart.setZoom(hours);
    }
  };
  const onSchemeChange = (e) => {
    applyDarkMode(e.matches);
    refreshThemeUI();
  };

  const initMenu = () => {
    const menuRoot = document.getElementById('menu-root');
    const menuToggleBtn = document.getElementById('menu-toggle');
    const menuToggleTheme = document.getElementById('menu-toggle-theme');
    const menuReload = document.getElementById('menu-reload');

    const closeMenu = () => {
      menuRoot?.classList.remove('open');
      if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'false');
    };
    const openMenu = () => {
      menuRoot?.classList.add('open');
      if (menuToggleBtn) menuToggleBtn.setAttribute('aria-expanded', 'true');
    };
    const toggleMenu = () => {
      if (menuRoot?.classList.contains('open')) closeMenu();
      else openMenu();
    };

    menuToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });
    // close on outside click
    document.addEventListener('click', (e) => {
      if (!menuRoot || !menuRoot.classList.contains('open')) return;
      if (!menuRoot.contains(e.target)) closeMenu();
    });
    // close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    // toggle theme: flip current class independent of system preference
    menuToggleTheme?.addEventListener('click', () => {
      document.documentElement.classList.toggle('dark');
      refreshThemeUI();
      closeMenu();
    });

    // reload action
    menuReload?.addEventListener('click', () => {
      location.reload();
    });
  };

  if (media && media.addEventListener) {
    media.addEventListener('change', onSchemeChange);
  } else if (media && media.addListener) {
    media.addListener(onSchemeChange);
  }

  initMenu();

  zoomControls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || !button.dataset.hours) return;
    zoomControls.querySelector('.active')?.classList.remove('active');
    button.classList.add('active');
    const hours = parseInt(button.dataset.hours, 10);
    priceChart.setZoom(hours);
  });

  typeControls.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    typeControls.querySelector('.active')?.classList.remove('active');
    button.classList.add('active');
    const chartType = button.id === 'bar-chart-btn' ? 'bar' : 'line';
    priceChart.setChartType(chartType);
  });

  updateDisplay();
  setInterval(updateDisplay, 60000);
  priceChart.resizeChart();

  let lastActivityTime = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const currentTime = Date.now();
      const timeSinceLastActivity = currentTime - lastActivityTime;
      const reloadThreshold = 1 * 60 * 1000; // 1 minute

      if (timeSinceLastActivity > reloadThreshold) {
        console.log('App reactivated at ' + currentTime + ', refreshing data...');
        updateDisplay();
      }
      lastActivityTime = currentTime;
    } else {
      lastActivityTime = Date.now();
    }
  });
}

init();
