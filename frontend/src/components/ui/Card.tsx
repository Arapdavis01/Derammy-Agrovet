import React from 'react';
import styles from './Card.module.css';

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
      className={styles.card} 
      onClick={onClick} 
      style={{ borderTop: `4px solid ${color || '#1B5E20'}` }}
    >
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.value}>{value}</p>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </div>
  );
};

export default Card;
