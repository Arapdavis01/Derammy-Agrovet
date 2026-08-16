import React from 'react';

interface CardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  onClick?: () => void;
}

const Card: React.FC<CardProps> = ({ title, value, subtitle, icon, color, onClick }) => {
  return (
    <div
      className="card dashboard-card"
      onClick={onClick}
      style={{ borderTop: `4px solid ${color || '#1B5E20'}` }}
    >
      {icon && <i className={`fas ${icon} dashboard-card-icon`}></i>}
      <div className="dashboard-card-content">
        <h3 className="dashboard-card-title">{title}</h3>
        <p className="dashboard-card-value">{value}</p>
        {subtitle && <p className="dashboard-card-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
};

export default Card;
