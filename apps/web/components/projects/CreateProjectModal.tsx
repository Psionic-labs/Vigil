/**
 * @file CreateProjectModal.tsx
 * @description Modal dialog to create new projects in the dashboard.
 * @why Enables users to dynamically register new application monitoring contexts.
 */

"use client"
import { useState } from "react"
import { X } from "lucide-react"

import { type Project } from "@/lib/projects-context"

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<Project>
}

export function CreateProjectModal({ isOpen, onClose, onSubmit }: CreateProjectModalProps) {
  const [name, setName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError("Project name is required")
      return
    }
    
    try {
      setIsSubmitting(true)
      setError(null)
      await onSubmit(name)
      setName("")
      onClose()
    } catch {
      setError("Failed to create project")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2">
          <h2 id="modal-title" className="text-sm font-semibold text-text-1">Create Project</h2>
          <button 
            onClick={onClose}
            aria-label="Close dialog"
            className="text-text-3 hover:text-text-1 transition-colors p-1 rounded-md hover:bg-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label htmlFor="projectName" className="block text-xs font-semibold uppercase tracking-wider text-text-3 mb-2">
              Project Name
            </label>
            <input
              id="projectName"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Checkout App"
              className="w-full px-4 py-2.5 text-sm bg-bg border border-border rounded-xl text-text-1 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              autoFocus
              maxLength={100}
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </div>
          
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-2 hover:text-text-1 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-light text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
