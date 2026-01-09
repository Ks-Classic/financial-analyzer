// src/components/comment-generator/MultiPageAnalysis/components/ProgressIndicator.tsx
// 進捗インジケーターコンポーネント

import React from 'react';
import { WizardStep, WIZARD_STEPS, WizardStepDefinition } from '../../../../types/multi-page-analysis';

interface ProgressIndicatorProps {
    currentStep: WizardStep;
    completedSteps: WizardStep[];
    onStepClick?: (step: WizardStep) => void;
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
    currentStep,
    completedSteps,
    onStepClick,
}) => {
    const getStepStatus = (step: WizardStepDefinition): 'current' | 'completed' | 'upcoming' => {
        if (step.id === currentStep) return 'current';
        if (completedSteps.includes(step.id)) return 'completed';
        return 'upcoming';
    };

    const isClickable = (step: WizardStepDefinition): boolean => {
        const status = getStepStatus(step);
        return status === 'completed' && !!onStepClick;
    };

    return (
        <div className="flex items-center justify-center gap-2 bg-white border-b border-gray-200 px-6 py-4">
            {WIZARD_STEPS.map((step, index) => {
                const status = getStepStatus(step);
                const clickable = isClickable(step);

                return (
                    <React.Fragment key={step.id}>
                        <button
                            onClick={() => clickable && onStepClick?.(step.id)}
                            disabled={!clickable}
                            className={`
                flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                ${status === 'current'
                                    ? 'bg-indigo-600 text-white shadow-lg scale-105'
                                    : status === 'completed'
                                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                        : 'bg-gray-100 text-gray-400'
                                }
                ${clickable ? 'cursor-pointer' : 'cursor-default'}
              `}
                        >
                            <span className="text-lg">
                                {status === 'completed' ? '✓' : step.icon}
                            </span>
                            <span className="text-sm font-medium hidden md:inline">
                                {step.name}
                            </span>
                        </button>

                        {index < WIZARD_STEPS.length - 1 && (
                            <div
                                className={`
                  w-8 h-0.5 hidden sm:block
                  ${status === 'completed' ? 'bg-indigo-400' : 'bg-gray-200'}
                `}
                            />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

export default ProgressIndicator;
