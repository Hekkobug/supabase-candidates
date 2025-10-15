import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Table,
  Button,
  Input,
  Select,
  DatePicker,
  Space,
  Card,
  Tag,
  message,
  Popconfirm,
  Typography,
  Row,
  Col,
  Tooltip,
  Progress,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  UserOutlined,
  FilterOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Text } = Typography;

interface Candidate {
  id: string;
  full_name: string;
  applied_position: string;
  status: string;
  resume_url: string;
  created_at: string;
  user_id: string;
  skills?: string[]; // ✅ thêm trường skills
  matching_score?: number; // ✅ thêm trường matching_score
}

interface CandidateListProps {
  reload?: boolean;
  onReloadDone?: () => void;
}

export default function CandidateList({ reload, onReloadDone }: CandidateListProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Bộ lọc
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("");
  const [status, setStatus] = useState("");
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(
    null
  );

  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
    };
    fetchUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) fetchCandidates();
    else setCandidates([]);
  }, [user]);

  useEffect(() => {
    if (reload) {
      fetchCandidates().finally(() => {
        onReloadDone?.();
      });
    }
  }, [reload]);

  async function fetchCandidates() {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      message.error("Lỗi khi tải danh sách: " + error.message);
    } else {
      setCandidates(data || []);
    }
    setLoading(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("candidates").delete().eq("id", id);
    if (error) {
      message.error("Lỗi khi xóa: " + error.message);
    } else {
      message.success("Xóa hồ sơ thành công!");
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
  const { error } = await supabase
    .from("candidates")
    .update({ status: newStatus })
    .eq("id", id);

  if (error) {
    message.error("Lỗi khi cập nhật trạng thái: " + error.message);
  } else {
    message.success(`Đã cập nhật trạng thái thành "${newStatus}"`);
    setCandidates((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, status: newStatus } : c
      )
    );
  }
}

  // Lọc dữ liệu
  const filteredCandidates = candidates.filter((candidate) => {
    const matchesSearch =
      !search ||
      candidate.full_name.toLowerCase().includes(search.toLowerCase()) ||
      candidate.applied_position?.toLowerCase().includes(search.toLowerCase());

    const matchesPosition =
      !position ||
      candidate.applied_position
        ?.toLowerCase()
        .includes(position.toLowerCase());

    const matchesStatus = !status || candidate.status === status;

    const matchesDate =
      !dateRange ||
      (dayjs(candidate.created_at).isAfter(dateRange[0].startOf("day")) &&
        dayjs(candidate.created_at).isBefore(dateRange[1].endOf("day")));

    return matchesSearch && matchesPosition && matchesStatus && matchesDate;
  });

  const handleResetFilters = () => {
    setSearch("");
    setPosition("");
    setStatus("");
    setDateRange(null);
  };

  const columns: ColumnsType<Candidate> = [
    {
      title: "Họ tên",
      dataIndex: "full_name",
      key: "full_name",
      render: (text: string) => (
        <Space>
          <UserOutlined style={{ color: "#1890ff" }} />
          <Text strong>{text}</Text>
        </Space>
      ),
      fixed: "left",
      width: 160,
    },
    {
      title: "Vị trí",
      dataIndex: "applied_position",
      key: "applied_position",
      render: (text: string) => text || "—",
      width: 150,
    },
    {
      title: "Kỹ năng",
      dataIndex: "skills",
      key: "skills",
      render: (skills?: string[]) =>
        skills && skills.length > 0 ? (
          <Space wrap>
            {skills.slice(0, 5).map((skill, index) => (
              <Tag key={index} color="blue">
                {skill}
              </Tag>
            ))}
            {skills.length > 5 && <Tag>+{skills.length - 5}</Tag>}
          </Space>
        ) : (
          <Text type="secondary">Không có</Text>
        ),
      width: 280,
    },
    {
      title: "Điểm phù hợp",
      dataIndex: "matching_score",
      key: "matching_score",
      render: (score?: number) =>
        typeof score === "number" ? (
          <Tooltip title={`${score}%`}>
            <Progress
              percent={score}
              size="small"
              status={
                score >= 70 ? "success" : score >= 40 ? "active" : "exception"
              }
              showInfo={false}
              style={{ width: 100 }}
            />
            <Text style={{ marginLeft: 8 }}>{score}%</Text>
          </Tooltip>
        ) : (
          <Text type="secondary">—</Text>
        ),
      align: "center",
      width: 180,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: string, record: Candidate) => (
        <Select
          value={status}
          style={{ width: 180, }}
          onChange={(value) => handleStatusChange(record.id, value)}
          getPopupContainer={(trigger) => trigger.parentElement} // tránh lỗi trong bảng
          options={[
            { value: "New", label: "New" },
            { value: "Interviewing", label: "Interviewing" },
            { value: "Hired", label: "Hired" },
          ]}
        />
      ),
    },
    {
      title: "Ngày nộp",
      dataIndex: "created_at",
      key: "created_at",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY HH:mm"),
      sorter: (a, b) => dayjs(a.created_at).unix() - dayjs(b.created_at).unix(),
      width: 160,
    },
    {
      title: "CV",
      key: "resume_url",
      render: (record: Candidate) =>
        record.resume_url ? (
          <Tooltip title="Xem CV">
            <Button
              type="link"
              icon={<FilePdfOutlined />}
              href={record.resume_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Xem
            </Button>
          </Tooltip>
        ) : (
          <Text type="secondary">Không có</Text>
        ),
      width: 100,
    },
    {
      title: "Thao tác",
      key: "actions",
      render: (record: Candidate) => (
        <Popconfirm
          title="Xóa hồ sơ"
          description="Bạn có chắc muốn xóa hồ sơ này?"
          onConfirm={() => handleDelete(record.id)}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <Button type="text" danger icon={<DeleteOutlined />}>
            Xóa
          </Button>
        </Popconfirm>
      ),
      width: 100,
    },
  ];

  if (!user) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "20px" }}>
          <Text type="secondary">
            Vui lòng đăng nhập để xem danh sách hồ sơ.
          </Text>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ padding: "24px" }}>
      <Card
        title={
          <Space>
            <UserOutlined />
            <span>Danh sách hồ sơ ứng viên</span>
            <Tag color="blue">{filteredCandidates.length} hồ sơ</Tag>
          </Space>
        }
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchCandidates}
            loading={loading}
          >
            Làm mới
          </Button>
        }
      >
        {/* Bộ lọc */}
        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={
            <Space>
              <FilterOutlined />
              <span>Bộ lọc</span>
            </Space>
          }
          extra={
            <Button size="small" onClick={handleResetFilters}>
              Đặt lại
            </Button>
          }
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Input
                placeholder="Tìm theo tên hoặc vị trí"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                prefix={<SearchOutlined />}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Input
                placeholder="Lọc theo vị trí"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={6}>
              <Select
                placeholder="Trạng thái"
                value={status || undefined}
                onChange={setStatus}
                style={{ width: "100%" }}
                allowClear
              >
                <Option value="New">New</Option>
                <Option value="Interviewing">Interviewing</Option>
                <Option value="Hired">Hired</Option>
              </Select>
            </Col>
            <Col xs={24} sm={12} md={6}>
              <RangePicker
                style={{ width: "100%" }}
                value={dateRange}
                onChange={(dates) =>
                  setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])
                }
                format="DD/MM/YYYY"
                placeholder={["Từ ngày", "Đến ngày"]}
              />
            </Col>
          </Row>
        </Card>

        {/* Bảng dữ liệu */}
        <Table
          columns={columns}
          dataSource={filteredCandidates}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) =>
              `${range[0]}-${range[1]} của ${total} hồ sơ`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
}
