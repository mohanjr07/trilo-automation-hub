export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          asset_name: string
          asset_type: string
          assigned_at: string | null
          created_at: string
          holder_id: string | null
          holder_name: string | null
          id: string
          notes: string | null
          serial_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          asset_name: string
          asset_type?: string
          assigned_at?: string | null
          created_at?: string
          holder_id?: string | null
          holder_name?: string | null
          id?: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          asset_name?: string
          asset_type?: string
          assigned_at?: string | null
          created_at?: string
          holder_id?: string | null
          holder_name?: string | null
          id?: string
          notes?: string | null
          serial_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_status: {
        Row: {
          created_at: string | null
          id: string
          note: string | null
          status: string
          status_date: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          note?: string | null
          status: string
          status_date?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          note?: string | null
          status?: string
          status_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          group_key: string | null
          group_label: string | null
          id: string
          is_builtin: boolean
          key: string
          label: string
          rate_unit_label: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          group_key?: string | null
          group_label?: string | null
          id?: string
          is_builtin?: boolean
          key: string
          label: string
          rate_unit_label?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          group_key?: string | null
          group_label?: string | null
          id?: string
          is_builtin?: boolean
          key?: string
          label?: string
          rate_unit_label?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      expense_tier_limits: {
        Row: {
          category: string
          id: string
          max_amount: number | null
          tier: number
          updated_at: string
        }
        Insert: {
          category: string
          id?: string
          max_amount?: number | null
          tier: number
          updated_at?: string
        }
        Update: {
          category?: string
          id?: string
          max_amount?: number | null
          tier?: number
          updated_at?: string
        }
        Relationships: []
      }
      holidays: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          date: string
          description: string | null
          id: string
          is_recurring: boolean | null
          name: string | null
          title: string
          type: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          date: string
          description?: string | null
          id?: string
          is_recurring?: boolean | null
          name?: string | null
          title: string
          type?: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          description?: string | null
          id?: string
          is_recurring?: boolean | null
          name?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      kra_kpi: {
        Row: {
          created_at: string
          created_by: string | null
          cycle_year: number
          final_feedback: string | null
          final_rating: number | null
          focus_area: string
          goal: string
          id: string
          kpi: string | null
          q1_admin_feedback: string | null
          q1_manager_feedback: string | null
          q1_progress: string | null
          q1_rating: number | null
          q2_admin_feedback: string | null
          q2_manager_feedback: string | null
          q2_progress: string | null
          q2_rating: number | null
          q3_admin_feedback: string | null
          q3_manager_feedback: string | null
          q3_progress: string | null
          q3_rating: number | null
          q4_admin_feedback: string | null
          q4_manager_feedback: string | null
          q4_progress: string | null
          q4_rating: number | null
          updated_at: string
          user_id: string
          weightage: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cycle_year?: number
          final_feedback?: string | null
          final_rating?: number | null
          focus_area: string
          goal: string
          id?: string
          kpi?: string | null
          q1_admin_feedback?: string | null
          q1_manager_feedback?: string | null
          q1_progress?: string | null
          q1_rating?: number | null
          q2_admin_feedback?: string | null
          q2_manager_feedback?: string | null
          q2_progress?: string | null
          q2_rating?: number | null
          q3_admin_feedback?: string | null
          q3_manager_feedback?: string | null
          q3_progress?: string | null
          q3_rating?: number | null
          q4_admin_feedback?: string | null
          q4_manager_feedback?: string | null
          q4_progress?: string | null
          q4_rating?: number | null
          updated_at?: string
          user_id: string
          weightage?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cycle_year?: number
          final_feedback?: string | null
          final_rating?: number | null
          focus_area?: string
          goal?: string
          id?: string
          kpi?: string | null
          q1_admin_feedback?: string | null
          q1_manager_feedback?: string | null
          q1_progress?: string | null
          q1_rating?: number | null
          q2_admin_feedback?: string | null
          q2_manager_feedback?: string | null
          q2_progress?: string | null
          q2_rating?: number | null
          q3_admin_feedback?: string | null
          q3_manager_feedback?: string | null
          q3_progress?: string | null
          q3_rating?: number | null
          q4_admin_feedback?: string | null
          q4_manager_feedback?: string | null
          q4_progress?: string | null
          q4_rating?: number | null
          updated_at?: string
          user_id?: string
          weightage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kra_kpi_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kra_kpi_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policy: {
        Row: {
          allowed_days: number | null
          id: string
          is_enabled: boolean | null
          leave_type: string
          updated_at: string | null
        }
        Insert: {
          allowed_days?: number | null
          id?: string
          is_enabled?: boolean | null
          leave_type: string
          updated_at?: string | null
        }
        Update: {
          allowed_days?: number | null
          id?: string
          is_enabled?: boolean | null
          leave_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          admin_note: string | null
          created_at: string | null
          employee_id: string
          end_date: string | null
          end_time: string | null
          half_day_period: string | null
          id: string
          is_half_day: boolean
          leave_category: string | null
          reason: string
          reverted_at: string | null
          reverted_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          start_time: string | null
          status: string | null
          type: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string | null
          employee_id: string
          end_date?: string | null
          end_time?: string | null
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean
          leave_category?: string | null
          reason: string
          reverted_at?: string | null
          reverted_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          start_time?: string | null
          status?: string | null
          type: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string | null
          employee_id?: string
          end_date?: string | null
          end_time?: string | null
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean
          leave_category?: string | null
          reason?: string
          reverted_at?: string | null
          reverted_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          start_time?: string | null
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          id: string
          is_enabled: boolean | null
          pref_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          is_enabled?: boolean | null
          pref_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          is_enabled?: boolean | null
          pref_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          email_sent: boolean | null
          id: string
          is_read: boolean | null
          reference_id: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          is_read?: boolean | null
          reference_id?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          email_sent?: boolean | null
          id?: string
          is_read?: boolean | null
          reference_id?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_flow_nodes: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          parent_id: string | null
          position: number
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organisation_flow_nodes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organisation_flow_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "organisation_flow_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          amount: number
          bill_file_name: string | null
          bill_file_path: string
          bill_mime_type: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          decision_note: string | null
          expense_category: string | null
          id: string
          meal_count: number | null
          paid_at: string | null
          paid_by: string | null
          paid_by_name: string | null
          payment_for: string
          petrol_km: number | null
          project_id: string | null
          project_name: string | null
          purpose: string
          requester_id: string
          requester_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bill_file_name?: string | null
          bill_file_path: string
          bill_mime_type?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          expense_category?: string | null
          id?: string
          meal_count?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_name?: string | null
          payment_for?: string
          petrol_km?: number | null
          project_id?: string | null
          project_name?: string | null
          purpose: string
          requester_id: string
          requester_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_file_name?: string | null
          bill_file_path?: string
          bill_mime_type?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          decision_note?: string | null
          expense_category?: string | null
          id?: string
          meal_count?: number | null
          paid_at?: string | null
          paid_by?: string | null
          paid_by_name?: string | null
          payment_for?: string
          petrol_km?: number | null
          project_id?: string | null
          project_name?: string | null
          purpose?: string
          requester_id?: string
          requester_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          department: string | null
          email: string
          expense_tier: number | null
          full_name: string
          id: string
          is_active: boolean | null
          manager_id: string | null
          phone: string | null
          position: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          email: string
          expense_tier?: number | null
          full_name: string
          id: string
          is_active?: boolean | null
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          department?: string | null
          email?: string
          expense_tier?: number | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          manager_id?: string | null
          phone?: string | null
          position?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string | null
          id: string
          project_id: string
          role: string | null
          sort_order: number | null
          team_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_id: string
          role?: string | null
          sort_order?: number | null
          team_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_id?: string
          role?: string | null
          sort_order?: number | null
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "project_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_photos: {
        Row: {
          address: string | null
          captured_at: string
          created_at: string
          id: string
          image_url: string
          latitude: number | null
          longitude: number | null
          note: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          address?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          image_url: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          address?: string | null
          captured_at?: string
          created_at?: string
          id?: string
          image_url?: string
          latitude?: number | null
          longitude?: number | null
          note?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_photos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_teams: {
        Row: {
          created_at: string | null
          id: string
          name: string
          project_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          project_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_teams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_tracker_settings: {
        Row: {
          checkin_time: string
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          checkin_time?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          checkin_time?: string
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_tracker_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_requests: {
        Row: {
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          decision_note: string | null
          id: string
          location: string
          notes: string | null
          planned_at: string
          purpose: string | null
          site_name: string
          site_visit_id: string | null
          status: string
          stop_order: number
          trip_group_id: string
          user_id: string
        }
        Insert: {
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          decision_note?: string | null
          id?: string
          location: string
          notes?: string | null
          planned_at?: string
          purpose?: string | null
          site_name: string
          site_visit_id?: string | null
          status?: string
          stop_order?: number
          trip_group_id?: string
          user_id: string
        }
        Update: {
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          decision_note?: string | null
          id?: string
          location?: string
          notes?: string | null
          planned_at?: string
          purpose?: string | null
          site_name?: string
          site_visit_id?: string | null
          status?: string
          stop_order?: number
          trip_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_requests_site_visit_id_fkey"
            columns: ["site_visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          arrived_at: string | null
          arrived_latitude: number | null
          arrived_longitude: number | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          departed_at: string | null
          departed_latitude: number | null
          departed_longitude: number | null
          end_latitude: number | null
          end_longitude: number | null
          ended_at: string | null
          id: string
          km_end: number | null
          km_start: number | null
          location: string
          notes: string | null
          purpose: string | null
          request_id: string | null
          site_name: string
          start_latitude: number | null
          start_longitude: number | null
          started_at: string | null
          stop_order: number
          trip_group_id: string
          trip_status: string
          user_id: string
          visit_date: string
        }
        Insert: {
          arrived_at?: string | null
          arrived_latitude?: number | null
          arrived_longitude?: number | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          departed_at?: string | null
          departed_latitude?: number | null
          departed_longitude?: number | null
          end_latitude?: number | null
          end_longitude?: number | null
          ended_at?: string | null
          id?: string
          km_end?: number | null
          km_start?: number | null
          location: string
          notes?: string | null
          purpose?: string | null
          request_id?: string | null
          site_name: string
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string | null
          stop_order?: number
          trip_group_id?: string
          trip_status?: string
          user_id: string
          visit_date?: string
        }
        Update: {
          arrived_at?: string | null
          arrived_latitude?: number | null
          arrived_longitude?: number | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          departed_at?: string | null
          departed_latitude?: number | null
          departed_longitude?: number | null
          end_latitude?: number | null
          end_longitude?: number | null
          ended_at?: string | null
          id?: string
          km_end?: number | null
          km_start?: number | null
          location?: string
          notes?: string | null
          purpose?: string | null
          request_id?: string | null
          site_name?: string
          start_latitude?: number | null
          start_longitude?: number | null
          started_at?: string | null
          stop_order?: number
          trip_group_id?: string
          trip_status?: string
          user_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assignee_role: string | null
          created_at: string | null
          id: string
          task_id: string
          user_id: string
        }
        Insert: {
          assignee_role?: string | null
          created_at?: string | null
          id?: string
          task_id: string
          user_id: string
        }
        Update: {
          assignee_role?: string | null
          created_at?: string | null
          id?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_columns: {
        Row: {
          color: string
          created_at: string | null
          id: string
          is_default: boolean
          key: string
          label: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          is_default?: boolean
          key: string
          label: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          is_default?: boolean
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          body: string
          created_at: string | null
          id: string
          parent_id: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          parent_id?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "task_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          category: string | null
          created_at: string | null
          deadline: string | null
          description: string | null
          id: string
          priority: string | null
          progress: number | null
          project_id: string | null
          project_team_id: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          category?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          progress?: number | null
          project_id?: string | null
          project_team_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          category?: string | null
          created_at?: string | null
          deadline?: string | null
          description?: string | null
          id?: string
          priority?: string | null
          progress?: number | null
          project_id?: string | null
          project_team_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_team_id_fkey"
            columns: ["project_team_id"]
            isOneToOne: false
            referencedRelation: "project_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_meeting_participants: {
        Row: {
          created_at: string | null
          id: string
          joined_at: string | null
          meeting_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          meeting_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          meeting_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "team_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      team_meetings: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          duration_minutes: number | null
          id: string
          meeting_link: string | null
          scheduled_at: string
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_link?: string | null
          scheduled_at: string
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_link?: string | null
          scheduled_at?: string
          status?: string | null
          title?: string
        }
        Relationships: []
      }
      user_documents: {
        Row: {
          category: string | null
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          name: string
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          name?: string
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_task_column_prefs: {
        Row: {
          column_key: string
          custom_label: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          column_key: string
          custom_label: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          column_key?: string
          custom_label?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_task_column_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_task_columns: {
        Row: {
          color: string
          created_at: string | null
          id: string
          key: string
          label: string
          position: number
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          id?: string
          key: string
          label: string
          position?: number
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          id?: string
          key?: string
          label?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_task_columns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_app_user: {
        Args: {
          p_department?: string
          p_email: string
          p_full_name: string
          p_password: string
          p_phone?: string
          p_position?: string
          p_role: string
        }
        Returns: string
      }
      add_expense_category: {
        Args: { p_key: string; p_label: string }
        Returns: undefined
      }
      can_view_sales_tracker_of: {
        Args: { target: string; uid: string }
        Returns: boolean
      }
      create_notification: {
        Args: {
          p_body: string
          p_reference_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      deactivate_user: { Args: { p_email: string }; Returns: undefined }
      delete_app_user: { Args: { p_email: string }; Returns: undefined }
      delete_app_user_by_id: { Args: { p_user_id: string }; Returns: undefined }
      delete_expense_category: { Args: { p_key: string }; Returns: undefined }
      get_active_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          role: string
        }[]
      }
      get_user_role: { Args: { uid: string }; Returns: string }
      is_accountant: { Args: { uid: string }; Returns: boolean }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_manager_of: {
        Args: { _employee_id: string; _manager_id: string }
        Returns: boolean
      }
      is_strict_admin: { Args: { uid: string }; Returns: boolean }
      list_active_projects_for_payment_requests: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      notify_sales_tracker_event: {
        Args: {
          p_body: string
          p_reference_id: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      reactivate_user: { Args: { p_email: string }; Returns: undefined }
      reset_user_password: {
        Args: { p_email: string; p_new_password: string }
        Returns: undefined
      }
      set_user_expense_tier: {
        Args: { p_tier: number; p_user_id: string }
        Returns: undefined
      }
      set_user_role: {
        Args: { p_email: string; p_role: string }
        Returns: undefined
      }
      update_app_user: {
        Args: {
          p_department?: string
          p_full_name: string
          p_phone?: string
          p_position?: string
          p_role: string
          p_user_id: string
        }
        Returns: undefined
      }
      user_can_access_task: {
        Args: { task_id: string; uid: string }
        Returns: boolean
      }
      user_in_project: {
        Args: { _project_id: string; _uid: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
