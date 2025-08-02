import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import type { Socket } from 'socket.io-client';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

interface AnalyticsDashboardProps {
  roomId: string;
  socket: Socket | null;
}

interface Metrics {
  current_users: number;
  total_messages: number;
  active_broadcasters: number;
  peak_users: number;
  session_start: string;
}

interface HourlyData {
  hour: string;
  count: number;
}

interface UserActivity {
  user_name: string;
  message_count: number;
}

function AnalyticsDashboard({ roomId, socket }: AnalyticsDashboardProps) {
  const [metrics, setMetrics] = useState<Metrics>({
    current_users: 0,
    total_messages: 0,
    active_broadcasters: 0,
    peak_users: 0,
    session_start: ''
  });
  const [hourlyMessages, setHourlyMessages] = useState<HourlyData[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    if (!socket || !roomId) return;

    // Listen for real-time metric updates
    socket.on("roomMetrics", (data: Metrics) => {
      setMetrics(data);
    });

    socket.on("metricsUpdate", (update: Partial<Metrics>) => {
      setMetrics(prev => ({ ...prev, ...update }));
    });

    // Fetch initial analytics data
    fetchAnalytics();

    // Refresh analytics every 30 seconds
    const interval = setInterval(fetchAnalytics, 30000);

    return () => {
      socket.off("roomMetrics");
      socket.off("metricsUpdate");
      clearInterval(interval);
    };
  }, [socket, roomId]);

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`http://localhost:4000/api/analytics/${roomId}`);
      const data = await response.json();
      
      setMetrics(data.metrics || metrics);
      setHourlyMessages(data.hourlyMessages || []);
      setUserActivity(data.userActivity || []);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      setIsLoading(false);
    }
  };

  const exportAnalytics = async (format: 'json' | 'csv') => {
    try {
      const response = await fetch(`http://localhost:4000/api/analytics/${roomId}/export?format=${format}`);
      
      if (format === 'csv') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `room-${roomId}-analytics.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `room-${roomId}-analytics.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Failed to export analytics:', error);
    }
  };

  // Chart data configurations
  const messageChartData = {
    labels: hourlyMessages.map(item => item.hour),
    datasets: [
      {
        label: 'Messages per Hour',
        data: hourlyMessages.map(item => item.count),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const userActivityData = {
    labels: userActivity.slice(0, 5).map(user => user.user_name),
    datasets: [
      {
        label: 'Messages Sent',
        data: userActivity.slice(0, 5).map(user => user.message_count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 101, 101, 0.8)',
          'rgba(251, 191, 36, 0.8)',
          'rgba(139, 92, 246, 0.8)',
        ],
        borderWidth: 0,
      },
    ],
  };

  const engagementData = {
    labels: ['Active Users', 'Idle Users'],
    datasets: [
      {
        data: [metrics.current_users, Math.max(0, metrics.peak_users - metrics.current_users)],
        backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(107, 114, 128, 0.8)'],
        borderWidth: 0,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#ffffff',
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(156, 163, 175, 0.1)' },
      },
      y: {
        ticks: { color: '#9ca3af' },
        grid: { color: 'rgba(156, 163, 175, 0.1)' },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#ffffff',
        },
      },
    },
  };

  if (isLoading) {
    return (
      <div className="analytics-loading">
        <div className="spinner"></div>
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      {/* Toggle Button */}
      <button
        onClick={() => setShowDashboard(!showDashboard)}
        className="analytics-toggle"
      >
        📊 {showDashboard ? 'Hide Analytics' : 'Show Analytics'}
      </button>

      {showDashboard && (
        <div className="analytics-dashboard">
          {/* Header */}
          <div className="analytics-header">
            <h2>📊 Live Analytics Dashboard</h2>
            <div className="export-buttons">
              <button onClick={() => exportAnalytics('csv')} className="export-btn">
                📄 Export CSV
              </button>
              <button onClick={() => exportAnalytics('json')} className="export-btn">
                📋 Export JSON
              </button>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">👥</div>
              <div className="metric-content">
                <h3>Current Users</h3>
                <div className="metric-value">{metrics.current_users}</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">💬</div>
              <div className="metric-content">
                <h3>Total Messages</h3>
                <div className="metric-value">{metrics.total_messages}</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">🎥</div>
              <div className="metric-content">
                <h3>Broadcasters</h3>
                <div className="metric-value">{metrics.active_broadcasters}</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">📈</div>
              <div className="metric-content">
                <h3>Peak Users</h3>
                <div className="metric-value">{metrics.peak_users}</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="charts-grid">
            {/* Message Activity Chart */}
            <div className="chart-card">
              <h3>Message Activity (24h)</h3>
              <div className="chart-container">
                <Line data={messageChartData} options={chartOptions} />
              </div>
            </div>

            {/* Top Users Chart */}
            <div className="chart-card">
              <h3>Most Active Users</h3>
              <div className="chart-container">
                <Bar data={userActivityData} options={chartOptions} />
              </div>
            </div>

            {/* Engagement Chart */}
            <div className="chart-card">
              <h3>User Engagement</h3>
              <div className="chart-container">
                <Doughnut data={engagementData} options={doughnutOptions} />
              </div>
            </div>

            {/* Real-time Activity Feed */}
            <div className="chart-card activity-feed">
              <h3>📝 Activity Feed</h3>
              <div className="activity-list">
                <div className="activity-item">
                  <span className="activity-dot green"></span>
                  <span>{metrics.current_users} users currently active</span>
                </div>
                <div className="activity-item">
                  <span className="activity-dot blue"></span>
                  <span>{metrics.total_messages} messages sent today</span>
                </div>
                {metrics.active_broadcasters > 0 && (
                  <div className="activity-item">
                    <span className="activity-dot red"></span>
                    <span>{metrics.active_broadcasters} live broadcast(s)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalyticsDashboard;