import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import {
  Layout,
  Menu,
  Button,
  Space,
  Typography,
  Card,
  Avatar,
  Dropdown,
  message,
  Modal,
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  PlusOutlined,
  LoginOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import Auth from './components/auth';
import CandidateForm from './components/candidateForm';
import CandidateList from './components/candidateList';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

type MenuKey = 'candidates' | 'add-candidate' | 'login';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [selectedMenu, setSelectedMenu] = useState<MenuKey>('candidates');
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [addCandidateModalVisible, setAddCandidateModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reloadCandidates, setReloadCandidates] = useState(false);

  // Theo dõi trạng thái đăng nhập
  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
    };
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleMenuClick = (key: MenuKey) => {
    if (key === 'login') {
      setAuthModalVisible(true);
    } else if (key === 'add-candidate') {
      if (!user) {
        message.warning('Vui lòng đăng nhập để thêm ứng viên');
        setAuthModalVisible(true);
        return;
      }
      setAddCandidateModalVisible(true);
    } else {
      setSelectedMenu(key);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setLoading(false);
    message.success('Đã đăng xuất');
  };

  const handleAuthSuccess = () => {
    setAuthModalVisible(false);
    message.success('Đăng nhập thành công');
  };

  const handleCandidateCreated = () => {
    setAddCandidateModalVisible(false);
    setSelectedMenu('candidates');
    setReloadCandidates(true);
    message.success('Thêm ứng viên thành công');
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'Thông tin cá nhân',
      onClick: () => message.info('Tính năng đang phát triển'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Đăng xuất',
      onClick: handleLogout,
    },
  ];

  const renderContent = () => {
    switch (selectedMenu) {
      case 'candidates':
        return <CandidateList reload={reloadCandidates} onReloadDone={() => setReloadCandidates(false)} />;
      default:
        return <CandidateList reload={reloadCandidates} onReloadDone={() => setReloadCandidates(false)} />;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh', width: "210vh" }}>
      {/* Header */}
      <Header 
        style={{ 
          background: '#fff', 
          padding: '0 24px', 
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Space>
          <TeamOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
          <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
            HR Management
          </Title>
        </Space>

        <Space size="middle">
          {user ? (
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              arrow
            >
              <Button type="text" icon={<UserOutlined />} loading={loading}>
                <Space>
                  <Text>{user.email}</Text>
                  <Avatar size="small" icon={<UserOutlined />} />
                </Space>
              </Button>
            </Dropdown>
          ) : (
            <Button 
              type="primary" 
              icon={<LoginOutlined />}
              onClick={() => setAuthModalVisible(true)}
            >
              Đăng nhập
            </Button>
          )}
        </Space>
      </Header>

      <Layout>
        

        {/* Main Content */}
        <Layout style={{ padding: '24px' }}>
          <Content
            style={{
              background: '#fff',
              padding: '24px',
              margin: 0,
              minHeight: 280,
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
          >
            {/* Quick Actions */}
            {user && (
              <Card 
                size="small" 
                style={{ marginBottom: '24px' }}
                bodyStyle={{ padding: '16px' }}
              >
                <Space size="middle">
                  <Text strong>Thao tác nhanh:</Text>
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={() => setAddCandidateModalVisible(true)}
                  >
                    Thêm ứng viên
                  </Button>
                </Space>
              </Card>
            )}

            {/* Main Content */}
            {renderContent()}

            {/* Welcome message for non-logged in users */}
            {!user && selectedMenu === 'candidates' && (
              <Card style={{ textAlign: 'center', marginTop: '48px' }}>
                <TeamOutlined style={{ fontSize: '64px', color: '#1890ff', marginBottom: '16px' }} />
                <Title level={3}>Chào mừng đến với HR Management</Title>
                <Text type="secondary" style={{ fontSize: '16px', display: 'block', marginBottom: '24px' }}>
                  Đăng nhập để quản lý hồ sơ ứng viên và tìm kiếm nhân tài phù hợp
                </Text>
                <Button 
                  type="primary" 
                  size="large" 
                  icon={<LoginOutlined />}
                  onClick={() => setAuthModalVisible(true)}
                >
                  Đăng nhập để bắt đầu
                </Button>
              </Card>
            )}
          </Content>
        </Layout>
      </Layout>

      {/* Auth Modal */}
      <Modal
        title="Đăng nhập / Đăng ký"
        open={authModalVisible}
        onCancel={() => setAuthModalVisible(false)}
        footer={null}
        width={400}
        destroyOnClose
      >
        <Auth onSuccess={handleAuthSuccess} />
      </Modal>

      {/* Add Candidate Modal */}
      <Modal
        title="Thêm ứng viên mới"
        open={addCandidateModalVisible}
        onCancel={() => setAddCandidateModalVisible(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <CandidateForm onCreated={handleCandidateCreated} />
      </Modal>
    </Layout>
  );
}