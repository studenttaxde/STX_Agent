'use client';

import React, { useState } from 'react';
import { ChatBubbleLeftRightIcon, DocumentTextIcon, ChartBarIcon } from '@heroicons/react/24/outline';

interface TabLayoutProps {
  children: React.ReactNode;
  activeTab: 'conversation' | 'summary' | 'comparison';
  onTabChange: (tab: 'conversation' | 'summary' | 'comparison') => void;
  className?: string;
}

export default function TabLayout({ 
  children, 
  activeTab, 
  onTabChange,
  className = ''
}: TabLayoutProps) {
  const tabs = [
    {
      id: 'conversation' as const,
      name: 'Conversation',
      icon: ChatBubbleLeftRightIcon,
      description: 'Chat with your tax advisor'
    },
    {
      id: 'summary' as const,
      name: 'Summary',
      icon: DocumentTextIcon,
      description: 'View your tax summary'
    },
    {
      id: 'comparison' as const,
      name: 'Year Comparison',
      icon: ChartBarIcon,
      description: 'Compare across years'
    }
  ];

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  group relative min-w-0 flex-1 overflow-hidden py-4 px-1 text-center text-sm font-medium hover:text-gray-700 focus:z-10 focus:outline-none
                  ${activeTab === tab.id 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                  }
                `}
              >
                <div className="flex items-center justify-center space-x-2">
                  <Icon className="h-5 w-5" />
                  <span>{tab.name}</span>
                </div>
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {children}
      </div>
    </div>
  );
} 