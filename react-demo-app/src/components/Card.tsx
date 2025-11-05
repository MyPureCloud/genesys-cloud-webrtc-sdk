import React from 'react'
import './Card.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div className={`card ${className}`}>
      <div className="card-content">{children}</div>
    </div>
  )
}
